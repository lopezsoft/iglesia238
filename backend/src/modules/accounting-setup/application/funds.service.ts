import { Inject, Injectable } from '@nestjs/common';
import {
  MAX_MONEY_AMOUNT,
  fromCents,
  sameText,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import {
  ConflictDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  TRANSACTION_RUNNER,
  type Transaction,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  EMPTY_FUND_FACTS,
  FUND_REPOSITORY,
  type FundFacts,
  type FundRecord,
  type FundRepository,
} from './fund.repository.js';
import type { FundRowView } from './setup.views.js';

export interface SaveFundInput {
  readonly name: string;
  readonly isActive: boolean;
  /** Null keeps the current opening balance; a value needs a sede. */
  readonly openingBalance: number | null;
}

const MIN_NAME = 3;
const MAX_NAME = 120;
const OPENING_ACTION = 'definir el saldo inicial del fondo';

/** Funds (or committees) of the denomination and the opening balance each sede carries into the year. */
@Injectable()
export class FundsService {
  constructor(
    @Inject(FUND_REPOSITORY) private readonly funds: FundRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async list(tenant: TenantContext): Promise<FundRowView[]> {
    const scope = tenant.tenantScope();
    const [records, facts] = await Promise.all([
      this.funds.list(scope),
      this.funds.facts(scope, this.currentYear()),
    ]);
    return records
      .toSorted(
        (a, b) => Number(b.isActive) - Number(a.isActive) || a.id - b.id,
      )
      .map((fund) =>
        toRow(fund, facts.get(fund.id) ?? EMPTY_FUND_FACTS, scope),
      );
  }

  async create(
    tenant: TenantContext,
    input: SaveFundInput,
  ): Promise<FundRowView> {
    const scope = tenant.tenantScope();
    const name = await this.validName(scope, input.name, null);
    const opening = this.validOpening(input.openingBalance);
    const sede =
      opening === null
        ? scope
        : requireCongregationScope(tenant, OPENING_ACTION);
    const year = this.currentYear();

    const fund = await this.transactions.run(async (transaction) => {
      const created = await this.funds.create(
        scope,
        { name, isActive: input.isActive },
        transaction,
      );
      if (opening !== null) {
        await this.applyOpening(
          sede,
          created.id,
          year,
          opening,
          false,
          transaction,
        );
      }
      await this.audit.record(
        {
          action: 'FUND_CREATED',
          entity: 'Fund',
          entityId: created.id,
          actor: tenant,
          changes: {
            ...buildAuditChanges(
              null,
              { name: created.name, isActive: created.isActive },
              ['name', 'isActive'],
            ),
            ...(opening === null
              ? {}
              : { openingBalance: { from: null, to: opening } }),
          },
        },
        transaction,
      );
      return created;
    });
    return this.rowOf(scope, fund.id);
  }

  async update(
    tenant: TenantContext,
    id: number,
    input: SaveFundInput,
  ): Promise<FundRowView> {
    const scope = tenant.tenantScope();
    const existing = this.orNotFound(await this.funds.find(scope, id));
    const name = await this.validName(scope, input.name, id);
    const opening = this.validOpening(input.openingBalance);
    const sede =
      opening === null
        ? scope
        : requireCongregationScope(tenant, OPENING_ACTION);
    const year = this.currentYear();
    const facts =
      (await this.funds.facts(scope, year, [id])).get(id) ?? EMPTY_FUND_FACTS;

    if (
      existing.isActive &&
      !input.isActive &&
      facts.suggestingActiveAccounts > 0
    ) {
      // Contributions, consolidations and tithe settlements post to the account's suggested fund.
      throw new ConflictDomainException(
        'El fondo es el fondo sugerido de cuentas activas: cambia el fondo sugerido de esas cuentas antes de desactivarlo.',
        'FUND_IS_DEFAULT',
      );
    }

    await this.transactions.run(async (transaction) => {
      const updated = await this.funds.update(
        scope,
        id,
        { name, isActive: input.isActive },
        transaction,
      );
      let openingChange = {};
      if (opening !== null) {
        const previous = await this.applyOpening(
          sede,
          id,
          year,
          opening,
          facts.hasMovementsInYear,
          transaction,
        );
        if (toCents(previous) !== toCents(opening)) {
          openingChange = { openingBalance: { from: previous, to: opening } };
        }
      }
      await this.audit.record(
        {
          action: 'FUND_UPDATED',
          entity: 'Fund',
          entityId: id,
          actor: tenant,
          changes: {
            ...buildAuditChanges(
              { name: existing.name, isActive: existing.isActive },
              { name: updated.name, isActive: updated.isActive },
              ['name', 'isActive'],
            ),
            ...openingChange,
          },
        },
        transaction,
      );
    });
    return this.rowOf(scope, id);
  }

  async remove(tenant: TenantContext, id: number): Promise<void> {
    const scope = tenant.tenantScope();
    const fund = this.orNotFound(await this.funds.find(scope, id));
    const facts =
      (await this.funds.facts(scope, this.currentYear(), [id])).get(id) ??
      EMPTY_FUND_FACTS;
    if (isInUse(facts)) {
      throw new ConflictDomainException(
        'El fondo tiene movimientos, presupuesto o saldos: desactívalo en lugar de eliminarlo.',
        'FUND_IN_USE',
      );
    }
    await this.transactions.run(async (transaction) => {
      await this.funds.deleteOpeningBalances(scope, id, transaction);
      await this.funds.delete(scope, id, transaction);
      await this.audit.record(
        {
          action: 'FUND_DELETED',
          entity: 'Fund',
          entityId: id,
          actor: tenant,
          changes: { isActive: { from: fund.isActive, to: null } },
        },
        transaction,
      );
    });
  }

  // --- Rules ---------------------------------------------------------------------------------------

  private async validName(
    scope: TenantScope,
    raw: string,
    exceptId: number | null,
  ): Promise<string> {
    const name = raw.trim();
    if (name.length < MIN_NAME || name.length > MAX_NAME) {
      throw new InvalidInputException(
        `El nombre del fondo debe tener entre ${MIN_NAME} y ${MAX_NAME} caracteres.`,
        'INVALID_NAME',
      );
    }
    const funds = await this.funds.list(scope);
    if (
      funds.some((fund) => fund.id !== exceptId && sameText(fund.name, name))
    ) {
      throw new ConflictDomainException(
        'Ya existe un fondo con ese nombre en la denominación.',
        'FUND_NAME_TAKEN',
      );
    }
    return name;
  }

  private validOpening(amount: number | null): number | null {
    if (amount === null) {
      return null;
    }
    if (!Number.isFinite(amount) || amount < 0 || amount > MAX_MONEY_AMOUNT) {
      throw new InvalidInputException(
        'El saldo inicial no puede ser negativo.',
        'INVALID_AMOUNT',
      );
    }
    return fromCents(toCents(amount));
  }

  /** Sets the opening balance of the sede; returns the previous one. */
  private async applyOpening(
    sede: TenantScope,
    fundId: number,
    year: number,
    amount: number,
    hasMovementsInYear: boolean,
    transaction: Transaction,
  ): Promise<number> {
    const current = await this.funds.getOpeningBalance(
      sede,
      fundId,
      year,
      transaction,
    );
    if (toCents(current) === toCents(amount)) {
      return current;
    }
    if (hasMovementsInYear) {
      throw new ConflictDomainException(
        'El fondo ya tiene movimientos este año: el saldo inicial solo se ajusta con un comprobante.',
        'OPENING_BALANCE_LOCKED',
      );
    }
    await this.funds.setOpeningBalance(sede, fundId, year, amount, transaction);
    return current;
  }

  private async rowOf(scope: TenantScope, id: number): Promise<FundRowView> {
    const fund = this.orNotFound(await this.funds.find(scope, id));
    const facts =
      (await this.funds.facts(scope, this.currentYear(), [id])).get(id) ??
      EMPTY_FUND_FACTS;
    return toRow(fund, facts, scope);
  }

  private currentYear(): number {
    return Number(this.clock.today().slice(0, 4));
  }

  private orNotFound(fund: FundRecord | null): FundRecord {
    if (!fund) {
      throw new NotFoundDomainException('El fondo no existe.');
    }
    return fund;
  }
}

function isInUse(facts: FundFacts): boolean {
  return (
    facts.hasMovements ||
    facts.hasBudgetLines ||
    facts.suggestingAccounts > 0 ||
    facts.hasOpeningBalances
  );
}

function toRow(
  fund: FundRecord,
  facts: FundFacts,
  scope: TenantScope,
): FundRowView {
  return {
    id: fund.id,
    denominationId: fund.denominationId,
    name: fund.name,
    isActive: fund.isActive,
    openingBalance: facts.openingBalance,
    openingLocked: scope.congregationId === null || facts.hasMovementsInYear,
    inUse: isInUse(facts),
  };
}
