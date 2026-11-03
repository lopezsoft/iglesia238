import { Inject, Injectable } from '@nestjs/common';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import {
  ALL_CONGREGATIONS_LABEL,
  CONGREGATION_LOOKUP,
  type CongregationLookup,
} from '../../../common/accounting/congregation-lookup.port.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  toPeriodView,
  type PeriodRecord,
} from '../../../common/accounting/period-view.js';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { monthRange } from '../../../common/accounting/accounting-rules.js';
import {
  CASH_BOOK_REPOSITORY,
  type CashBookRepository,
  type CashLineRecord,
  type Direction,
} from './cash-book.repository.js';
import {
  closeBlockOf,
  computeBookTotals,
  openRangeOf,
  reversalBlockOf,
  targetFundOf,
  voucherCodeOf,
} from './cash-book-rules.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import type {
  CashBookOptionsView,
  CashBookRowView,
  CashBookViewResult,
  CashRowStatus,
} from './cash-book.views.js';

export interface CashBookQueryInput {
  readonly fundId: number;
  readonly periodId: number;
  readonly page: number;
  readonly pageSize: number;
  readonly direction?: Direction;
  readonly accountId?: number;
  readonly search?: string;
}

/** Reads of the cash book: the catalogs of the screen and the lines of a fund in a month. */
@Injectable()
export class CashBookQueryService {
  constructor(
    @Inject(CASH_BOOK_REPOSITORY) private readonly book: CashBookRepository,
    @Inject(CONGREGATION_LOOKUP)
    private readonly congregations: CongregationLookup,
    private readonly clock: Clock,
  ) {}

  async options(tenant: TenantContext): Promise<CashBookOptionsView> {
    const scope = tenant.tenantScope();
    const congregationId = scope.congregationId;
    const [funds, accounts, periods, name] = await Promise.all([
      this.book.listFunds(scope),
      this.book.listPostableAccounts(scope),
      congregationId === null
        ? Promise.resolve([] as PeriodRecord[])
        : this.book.listPeriods(scope),
      congregationId === null
        ? Promise.resolve(null)
        : this.congregations.nameOf(scope, congregationId),
    ]);
    return {
      today: this.clock.today(),
      congregationId,
      congregationName:
        congregationId === null ? ALL_CONGREGATIONS_LABEL : (name ?? ''),
      funds: funds
        .toSorted(
          (a, b) => Number(b.isActive) - Number(a.isActive) || a.id - b.id,
        )
        .map(({ id, name: fundName, isActive }) => ({
          id,
          name: fundName,
          isActive,
        })),
      periods: periods.map(toPeriodView),
      accounts: accounts.map(({ id, code, name: accountName, nature }) => ({
        id,
        code,
        name: accountName,
        nature,
      })),
    };
  }

  async view(
    tenant: TenantContext,
    input: CashBookQueryInput,
  ): Promise<CashBookViewResult> {
    const scope = requireCongregationScope(
      tenant,
      'consultar su libro de caja',
    );
    const today = this.clock.today();

    const period = await this.book.findPeriod(scope, input.periodId);
    if (!period) {
      throw new NotFoundDomainException(
        'El periodo contable no existe en la sede.',
        'PERIOD_NOT_FOUND',
      );
    }
    const fund = await this.book.findFund(scope, input.fundId);
    if (!fund) {
      throw new NotFoundDomainException(
        'El fondo no existe en la denominación.',
        'FUND_NOT_FOUND',
      );
    }

    const { from, to } = monthRange(period);
    const [
      index,
      base,
      page,
      periods,
      funds,
      pendingToday,
      pendingInPeriod,
      nextCi,
      nextCe,
    ] = await Promise.all([
      this.book.lineIndex(scope, fund.id, period.id),
      this.book.openingBase(scope, fund.id, period.year, from),
      this.book.findLines(scope, {
        fundId: fund.id,
        periodId: period.id,
        direction: input.direction,
        accountId: input.accountId,
        search: input.search?.trim() || undefined,
        skip: (input.page - 1) * input.pageSize,
        take: input.pageSize,
      }),
      this.book.listPeriods(scope),
      this.book.listFunds(scope),
      this.book.listPendingContributions(scope, today),
      period.status === 'OPEN'
        ? this.book.countPendingContributions(scope, from, to)
        : Promise.resolve(0),
      this.book.peekNextVoucherNumber(scope, 'CI'),
      this.book.peekNextVoucherNumber(scope, 'CE'),
    ]);

    const totals = computeBookTotals(
      toCents(base.yearOpening) + toCents(base.movedBefore),
      index,
    );
    const todaysForFund = pendingToday.filter(
      (contribution) =>
        targetFundOf(contribution.defaultFundId, funds) === fund.id,
    );
    const block = closeBlockOf({
      period,
      periods,
      today,
      pendingContributions: pendingInPeriod,
    });

    return {
      fundId: fund.id,
      fundName: fund.name,
      fundIsActive: fund.isActive,
      period: toPeriodView(period),
      opening: fromCents(totals.openingCents),
      income: fromCents(totals.incomeCents),
      expense: fromCents(totals.expenseCents),
      closing: fromCents(totals.closingCents),
      inCount: totals.inCount,
      outCount: totals.outCount,
      rows: page.rows.map((line) =>
        toRow(line, totals.balanceAfter.get(line.id) ?? 0, periods),
      ),
      totalRows: page.total,
      page: input.page,
      pageSize: input.pageSize,
      pendingToday: {
        date: today,
        count: todaysForFund.length,
        amount: fromCents(
          todaysForFund.reduce((sum, c) => sum + toCents(c.amount), 0),
        ),
      },
      closeBlockedReason: block?.message ?? null,
      nextCashIn: formatVoucherCode('CI', today, nextCi),
      nextCashOut: formatVoucherCode('CE', today, nextCe),
      openRange: openRangeOf(periods, today),
    };
  }
}

function toRow(
  line: CashLineRecord,
  balanceCents: number,
  periods: readonly PeriodRecord[],
): CashBookRowView {
  const status: CashRowStatus =
    line.reversalOfId !== null
      ? 'REVERSAL'
      : line.reversedBy
        ? 'REVERSED'
        : 'POSTED';
  const related = line.reversalOfVoucher ?? line.reversedBy?.voucher ?? null;
  return {
    id: line.id,
    postedOn: line.postedOn,
    voucherCode: voucherCodeOf(line.voucher),
    accountCode: line.accountCode,
    accountName: line.accountName,
    description: line.description,
    direction: line.direction,
    amount: line.amount,
    balance: fromCents(balanceCents),
    status,
    relatedVoucherCode: related ? voucherCodeOf(related) : null,
    reversalBlock: reversalBlockOf(line, periods),
  };
}
