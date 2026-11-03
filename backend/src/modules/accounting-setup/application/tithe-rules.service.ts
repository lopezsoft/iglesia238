import { Inject, Injectable } from '@nestjs/common';
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
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import {
  TRANSACTION_RUNNER,
  type TransactionRunner,
} from '../../../common/persistence/transaction.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  TITHE_RULE_REPOSITORY,
  type TitheRuleData,
  type TitheRuleRecord,
  type TitheRuleRepository,
} from './tithe-rule.repository.js';
import type { TitheRuleView } from './setup.views.js';

export interface SaveTitheRuleInput {
  readonly effectiveFrom: string;
  /** Fractions between 0 and 1 with at most four decimals (0.21 is 21 %). */
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}

const RATE_PRECISION = 10_000;

/**
 * Percentages used to settle the tithe. They are entered by each denomination: the system never
 * proposes a default, because they differ between denominations and change over time.
 * A settlement copies the rates it used, so a rule only needs protecting once a settlement relies on it.
 */
@Injectable()
export class TitheRulesService {
  constructor(
    @Inject(TITHE_RULE_REPOSITORY) private readonly rules: TitheRuleRepository,
    @Inject(TRANSACTION_RUNNER)
    private readonly transactions: TransactionRunner,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  /** Newest first. */
  async list(tenant: TenantContext): Promise<TitheRuleView[]> {
    const scope = tenant.tenantScope();
    const records = await this.rules.list(scope);
    return this.toViews(scope, records);
  }

  async create(
    tenant: TenantContext,
    input: SaveTitheRuleInput,
  ): Promise<TitheRuleView> {
    const scope = tenant.tenantScope();
    const data = this.validated(input);
    const records = await this.rules.list(scope);
    this.assertDateFree(records, data.effectiveFrom, null);

    const created = await this.transactions.run(async (transaction) => {
      const rule = await this.rules.create(scope, data, transaction);
      await this.audit.record(
        {
          action: 'TITHE_RULE_CREATED',
          entity: 'TitheSettlementRule',
          entityId: rule.id,
          actor: tenant,
          changes: buildAuditChanges(null, { ...rule }, [
            'effectiveFrom',
            'nationalShareRate',
            'localFundRate',
          ]),
        },
        transaction,
      );
      return rule;
    });
    return this.viewOf(scope, created.id);
  }

  async update(
    tenant: TenantContext,
    id: number,
    input: SaveTitheRuleInput,
  ): Promise<TitheRuleView> {
    const scope = tenant.tenantScope();
    const existing = this.orNotFound(await this.rules.find(scope, id));
    const data = this.validated(input);
    const records = await this.rules.list(scope);
    this.assertDateFree(records, data.effectiveFrom, id);
    await this.assertNotInUse(scope, records, existing);

    await this.transactions.run(async (transaction) => {
      const rule = await this.rules.update(scope, id, data, transaction);
      await this.audit.record(
        {
          action: 'TITHE_RULE_UPDATED',
          entity: 'TitheSettlementRule',
          entityId: id,
          actor: tenant,
          changes: buildAuditChanges({ ...existing }, { ...rule }, [
            'effectiveFrom',
            'nationalShareRate',
            'localFundRate',
          ]),
        },
        transaction,
      );
    });
    return this.viewOf(scope, id);
  }

  async remove(tenant: TenantContext, id: number): Promise<void> {
    const scope = tenant.tenantScope();
    const existing = this.orNotFound(await this.rules.find(scope, id));
    const records = await this.rules.list(scope);
    await this.assertNotInUse(scope, records, existing);

    await this.transactions.run(async (transaction) => {
      await this.rules.delete(scope, id, transaction);
      await this.audit.record(
        {
          action: 'TITHE_RULE_DELETED',
          entity: 'TitheSettlementRule',
          entityId: id,
          actor: tenant,
          changes: {
            effectiveFrom: { from: existing.effectiveFrom, to: null },
          },
        },
        transaction,
      );
    });
  }

  /** The rule that applies on `date` (the newest one that already started), if any. */
  static ruleInEffect<T extends { effectiveFrom: string }>(
    rules: readonly T[],
    date: string,
  ): T | undefined {
    return rules
      .filter((rule) => rule.effectiveFrom <= date)
      .toSorted((a, b) => b.effectiveFrom.localeCompare(a.effectiveFrom))[0];
  }

  /** Used by the setup overview. */
  async inForce(tenant: TenantContext): Promise<TitheRuleView | null> {
    return (await this.list(tenant)).find((rule) => rule.inForce) ?? null;
  }

  // --- Rules ---------------------------------------------------------------------------------------

  private validated(input: SaveTitheRuleInput): TitheRuleData {
    if (!isIsoDate(input.effectiveFrom)) {
      throw new InvalidInputException(
        'Indica la fecha desde la cual aplica el porcentaje.',
        'INVALID_DATE',
      );
    }
    for (const rate of [input.nationalShareRate, input.localFundRate]) {
      const scaled = rate * RATE_PRECISION;
      if (
        !Number.isFinite(rate) ||
        rate < 0 ||
        rate > 1 ||
        Math.abs(scaled - Math.round(scaled)) > 1e-6
      ) {
        throw new InvalidInputException(
          'Los porcentajes deben estar entre 0 % y 100 %, con máximo dos decimales.',
          'INVALID_RATE',
        );
      }
    }
    return {
      effectiveFrom: input.effectiveFrom,
      nationalShareRate:
        Math.round(input.nationalShareRate * RATE_PRECISION) / RATE_PRECISION,
      localFundRate:
        Math.round(input.localFundRate * RATE_PRECISION) / RATE_PRECISION,
    };
  }

  private assertDateFree(
    records: readonly TitheRuleRecord[],
    effectiveFrom: string,
    exceptId: number | null,
  ): void {
    if (
      records.some(
        (rule) => rule.id !== exceptId && rule.effectiveFrom === effectiveFrom,
      )
    ) {
      throw new ConflictDomainException(
        'Ya existe un porcentaje con esa fecha de inicio.',
        'RULE_DATE_TAKEN',
      );
    }
  }

  /** A rule is in use once a settlement not voided was settled under it. */
  private async assertNotInUse(
    scope: TenantScope,
    records: readonly TitheRuleRecord[],
    rule: TitheRuleRecord,
  ): Promise<void> {
    if (await this.isInUse(scope, records, rule)) {
      throw new ConflictDomainException(
        'Ya hay liquidaciones emitidas con este porcentaje: no se puede modificar ni eliminar. Registra uno nuevo con su fecha de inicio.',
        'RULE_IN_USE',
      );
    }
  }

  private async isInUse(
    scope: TenantScope,
    records: readonly TitheRuleRecord[],
    rule: TitheRuleRecord,
  ): Promise<boolean> {
    const next = records
      .filter((other) => other.effectiveFrom > rule.effectiveFrom)
      .toSorted((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom))[0];
    return (
      (await this.rules.countIssuedSettlements(
        scope,
        rule.effectiveFrom,
        next?.effectiveFrom ?? null,
      )) > 0
    );
  }

  private async toViews(
    scope: TenantScope,
    records: readonly TitheRuleRecord[],
  ): Promise<TitheRuleView[]> {
    const inForce = TitheRulesService.ruleInEffect(records, this.clock.today());
    return Promise.all(
      records.map(async (rule) => ({
        ...rule,
        inForce: rule.id === inForce?.id,
        inUse: await this.isInUse(scope, records, rule),
      })),
    );
  }

  private async viewOf(scope: TenantScope, id: number): Promise<TitheRuleView> {
    const records = await this.rules.list(scope);
    const view = (await this.toViews(scope, records)).find((r) => r.id === id);
    if (!view) {
      throw new NotFoundDomainException('El porcentaje no existe.');
    }
    return view;
  }

  private orNotFound(rule: TitheRuleRecord | null): TitheRuleRecord {
    if (!rule) {
      throw new NotFoundDomainException('El porcentaje no existe.');
    }
    return rule;
  }
}
