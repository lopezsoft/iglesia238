import { Inject, Injectable } from '@nestjs/common';
import {
  displayDate,
  fromCents,
  yearMonthOf,
} from '../../../common/accounting/accounting-rules.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import {
  DocumentNumberingService,
  formatVoucherCode,
} from '../../../common/numbering/document-numbering.service.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  CASH_BOOK_REPOSITORY,
  type CashAccountRecord,
  type CashBookRepository,
  type CashFundRecord,
  type PendingContribution,
} from './cash-book.repository.js';
import { groupPending, isMonthOpen, targetFundOf } from './cash-book-rules.js';
import type {
  ConsolidationGroupView,
  ConsolidationPreviewView,
  ConsolidationResultView,
} from './cash-book.views.js';

interface PendingPlan {
  readonly accounts: ReadonlyMap<number, CashAccountRecord>;
  readonly funds: ReadonlyMap<number, CashFundRecord>;
  readonly groups: ReturnType<typeof groupPending>;
}

/**
 * Moves the contributions received on a date into the cash book: one inflow per income account and
 * destination fund, all under a single CI voucher. Contributions keep their own receipt.
 */
@Injectable()
export class ConsolidationService {
  constructor(
    @Inject(CASH_BOOK_REPOSITORY) private readonly book: CashBookRepository,
    private readonly numbering: DocumentNumberingService,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async preview(
    tenant: TenantContext,
    date: string,
  ): Promise<ConsolidationPreviewView> {
    const scope = requireCongregationScope(
      tenant,
      'consultar los aportes pendientes',
    );
    this.requireDate(date);
    const plan = await this.plan(scope, date);
    const groups = this.toViews(plan);
    const next = await this.book.peekNextVoucherNumber(scope, 'CI');
    return {
      date,
      groups,
      count: groups.reduce((sum, group) => sum + group.count, 0),
      total: fromCents(
        plan.groups.reduce((sum, group) => sum + group.amountCents, 0),
      ),
      nextVoucherCode: formatVoucherCode('CI', date, next),
    };
  }

  async consolidate(
    tenant: TenantContext,
    date: string,
  ): Promise<ConsolidationResultView> {
    const scope = requireCongregationScope(tenant, 'consolidar aportes');
    this.requireDate(date);
    if (date > this.clock.today()) {
      throw new InvalidInputException(
        'La fecha a consolidar no puede ser posterior a hoy.',
        'FUTURE_DATE',
      );
    }
    const periods = await this.book.listPeriods(scope);
    const month = yearMonthOf(date);
    if (
      !periods.some((p) => p.year === month.year && p.month === month.month)
    ) {
      throw new NotFoundDomainException(
        'La sede no tiene abierto el periodo contable de esa fecha. Ábrelo desde la configuración contable.',
        'PERIOD_NOT_FOUND',
      );
    }
    if (!isMonthOpen(periods, month)) {
      throw new ConflictDomainException(
        'El periodo contable de esa fecha está cerrado: elige una fecha de un periodo abierto.',
        'PERIOD_CLOSED',
      );
    }
    const period = periods.find(
      (p) => p.year === month.year && p.month === month.month,
    )!;

    const plan = await this.plan(scope, date);
    if (plan.groups.length === 0) {
      throw new ConflictDomainException(
        'No hay aportes pendientes de consolidar en esa fecha.',
        'NOTHING_TO_CONSOLIDATE',
      );
    }
    for (const group of plan.groups) {
      const account = plan.accounts.get(group.accountId);
      if (!account || !account.isPostable || !account.isActive) {
        throw new BusinessRuleException(
          'La cuenta no es imputable: elige una cuenta que reciba movimientos.',
          'ACCOUNT_NOT_POSTABLE',
        );
      }
      if (!plan.funds.get(group.fundId)?.isActive) {
        throw new ConflictDomainException(
          'El fondo no existe o está inactivo.',
          'FUND_INACTIVE',
        );
      }
    }

    return this.transactions.run(async (transaction) => {
      const number = await this.numbering.nextVoucherNumber(
        scope,
        'CI',
        transaction,
      );
      const voucher = await this.book.createVoucher(
        scope,
        { type: 'CI', number, issuedOn: date },
        transaction,
      );
      for (const group of plan.groups) {
        const line = await this.book.createTransaction(
          scope,
          {
            periodId: period.id,
            accountId: group.accountId,
            fundId: group.fundId,
            voucherId: voucher.id,
            direction: 'IN',
            postedOn: date,
            amount: fromCents(group.amountCents),
            description: `Consolidación de aportes del ${displayDate(date)} (${group.count} ${group.count === 1 ? 'aporte' : 'aportes'})`,
            reversalOfId: null,
            createdById: tenant.userId,
          },
          transaction,
        );
        const linked = await this.book.linkContributions(
          scope,
          group.contributionIds,
          line.id,
          transaction,
        );
        if (linked !== group.contributionIds.length) {
          // Someone else consolidated or voided some of them in the meantime: nothing is kept.
          throw new ConflictDomainException(
            'Los aportes cambiaron mientras consolidabas. Vuelve a cargar la lista e inténtalo de nuevo.',
            'CONSOLIDATION_CONFLICT',
          );
        }
      }
      const count = plan.groups.reduce((sum, group) => sum + group.count, 0);
      const total = fromCents(
        plan.groups.reduce((sum, group) => sum + group.amountCents, 0),
      );
      const code = formatVoucherCode('CI', date, number);
      await this.audit.record(
        {
          action: 'CONTRIBUTIONS_CONSOLIDATED',
          entity: 'Voucher',
          entityId: voucher.id,
          actor: tenant,
          changes: {
            voucher: { from: null, to: code },
            contributions: { from: null, to: count },
            movements: { from: null, to: plan.groups.length },
            amount: { from: null, to: total },
          },
        },
        transaction,
      );
      return { voucherCode: code, movements: plan.groups.length, count, total };
    });
  }

  // --- Plan ----------------------------------------------------------------------------------------

  private async plan(scope: TenantScope, date: string): Promise<PendingPlan> {
    const pending = await this.book.listPendingContributions(scope, date);
    const [funds, accounts] = await Promise.all([
      this.book.listFunds(scope),
      this.book.listAccounts(scope, [
        ...new Set(pending.map((c) => c.accountId)),
      ]),
    ]);
    const accountById = new Map(accounts.map((a) => [a.id, a]));
    const fundOf = (contribution: PendingContribution): number => {
      const fundId = targetFundOf(contribution.defaultFundId, funds);
      if (fundId === null) {
        throw new BusinessRuleException(
          'Crea un fondo activo antes de consolidar los aportes.',
          'NO_ACTIVE_FUND',
        );
      }
      return fundId;
    };
    const groups = groupPending(pending, fundOf).toSorted((a, b) => {
      const codeA = accountById.get(a.accountId)?.code ?? '';
      const codeB = accountById.get(b.accountId)?.code ?? '';
      return codeA.localeCompare(codeB) || a.fundId - b.fundId;
    });
    return {
      accounts: accountById,
      funds: new Map(funds.map((f) => [f.id, f])),
      groups,
    };
  }

  private toViews(plan: PendingPlan): ConsolidationGroupView[] {
    return plan.groups.map((group) => ({
      accountId: group.accountId,
      accountCode: plan.accounts.get(group.accountId)?.code ?? '—',
      accountName: plan.accounts.get(group.accountId)?.name ?? '—',
      fundId: group.fundId,
      fundName: plan.funds.get(group.fundId)?.name ?? '—',
      count: group.count,
      amount: fromCents(group.amountCents),
    }));
  }

  private requireDate(date: string): void {
    if (!isIsoDate(date)) {
      throw new InvalidInputException('La fecha no es válida.', 'INVALID_DATE');
    }
  }
}
