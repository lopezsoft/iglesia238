import { Injectable, inject } from '@angular/core';
import { Observable, defer, map } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { roundMoney, ruleInEffect, voucherCode } from '../../data/accounting-rules';
import { AccountingTenant, inScope, requirePermission, writeTenant } from '../../data/accounting-tenant';
import {
  Contribution,
  TitheSettlement,
  TitheSettlementRule,
  VOUCHER_TYPES,
} from '../../data/accounting.models';
import { TitheAllocation, allocateTithe, effectiveRates } from './tithe-allocation';
import {
  TitheComponent,
  TitheContributionRow,
  TitheOverview,
  TithePreview,
  TitheRange,
  TitheSettlementRow,
} from './tithe-settlements.models';
import { TitheSettlementsRepository } from './tithe-settlements.repository';

const PERMISSION = 'tithe-settlements.write';
const MIN_REASON = 10;
const MAX_REASON = 255;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Expense accounts where the sede books what it pays when it settles the tithe (the local fund
 * share stays in the sede, so it has no movement). Lines are skipped when the denomination's
 * chart of accounts does not have them.
 */
const SETTLEMENT_ACCOUNT_CODES = { nationalShare: '530505', pastorNet: '530510' } as const;

type PayableKey = keyof typeof SETTLEMENT_ACCOUNT_CODES;

const PAYABLE_KEYS: readonly PayableKey[] = ['nationalShare', 'pastorNet'];
const PAYABLE_DESCRIPTIONS: Readonly<Record<PayableKey, string>> = {
  nationalShare: 'Participación nacional del diezmo',
  pastorNet: 'Asignación pastoral',
};

/** A cash line the settlement will post, already validated. */
interface PayableLine {
  readonly key: PayableKey;
  readonly accountId: number;
  readonly fundId: number;
  readonly amount: number;
}

type SedeTenant = AccountingTenant & { readonly congregationId: number };

/**
 * Demo adapter of the tithe settlement over the shared AccountingDemoStore: recorded TITHE
 * contributions of the sede in a range, not settled yet, split with the rule in force; ranges of
 * issued settlements never overlap; voiding releases the tithes and reverses the cash lines.
 */
@Injectable()
export class DemoTitheSettlementsRepository extends TitheSettlementsRepository {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AccountingDemoStore);
  private readonly db = inject(DemoDatabase);

  constructor() {
    super();
    this.store.ensurePendingContributions();
  }

  overview(): Observable<TitheOverview> {
    return this.read((tenant) => {
      const settlements =
        tenant.congregationId === null
          ? []
          : this.store.titheSettlements
              .filter((s) => inScope(tenant, s))
              .sort((a, b) => b.settledOn.localeCompare(a.settledOn) || b.id - a.id);
      const lastIssued = settlements
        .filter((s) => s.status === 'ISSUED')
        .sort((a, b) => b.coveredTo.localeCompare(a.coveredTo))[0];
      const rule = ruleInEffect(this.store.titheSettlementRules, tenant.denominationId, this.store.today);
      return {
        today: this.store.today,
        congregationScoped: tenant.congregationId !== null,
        congregationName:
          tenant.congregationId === null ? 'todas las sedes' : this.store.congregationName(tenant.congregationId),
        rule: rule ? toRuleView(rule) : null,
        lastIssued: lastIssued ? { from: lastIssued.coveredFrom, to: lastIssued.coveredTo } : null,
        settlements: settlements.map((s) => this.toRow(s)),
      };
    });
  }

  preview(range: TitheRange): Observable<TithePreview> {
    return this.read((tenant) => this.compute(requireSede(tenant), range));
  }

  confirm(range: TitheRange): Observable<TitheSettlementRow> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'liquidar el diezmo');
      const draft = this.compute(tenant, range);
      if (draft.count === 0) {
        throw new DomainError('NO_TITHES', 'No hay diezmos por liquidar en el rango seleccionado.');
      }
      const today = this.store.today;
      this.store.requireOpenPeriod(tenant.congregationId, today);
      const tithes = this.titheContributions(tenant, range).filter(isSettleable);
      const allocation = allocationOf(draft);
      // Everything is validated before the first write, so a refusal leaves no partial settlement.
      const payables = this.payableLines(tenant, allocation);

      const voucher = this.store.issueVoucher({
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        type: VOUCHER_TYPES.titheSettlement,
        issuedOn: today,
      });
      const settlement: TitheSettlement = {
        id: this.store.nextId(this.store.titheSettlements),
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        voucherId: voucher.id,
        pastorId: null,
        settledOn: today,
        coveredFrom: range.from,
        coveredTo: range.to,
        grossTithe: draft.grossTithe,
        nationalShareRate: draft.rule.nationalShareRate,
        localFundRate: draft.rule.localFundRate,
        ...allocation,
        status: 'ISSUED',
        voidedById: null,
        voidedAt: null,
        voidReason: null,
        createdAt: this.store.nowIso(),
      };
      this.store.titheSettlements.push(settlement);
      for (const tithe of tithes) {
        this.store.replace(this.store.contributions, { ...tithe, titheSettlementId: settlement.id });
      }
      this.postPayables(tenant, settlement, payables);
      const number = this.store.voucherCode(voucher.id);
      this.audit(tenant, settlement.id, 'TITHE_SETTLED', {
        status: { from: null, to: 'ISSUED' },
        number: { from: null, to: number },
        grossTithe: { from: null, to: settlement.grossTithe },
        nationalShare: { from: null, to: settlement.nationalShare },
        localFundShare: { from: null, to: settlement.localFundShare },
        pastorNet: { from: null, to: settlement.pastorNet },
        contributions: { from: null, to: tithes.length },
      });
      return this.toRow(settlement);
    });
  }

  void(settlementId: number, reason: string): Observable<TitheSettlementRow> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'anular liquidaciones del diezmo');
      const settlement = this.store.titheSettlements.find((s) => s.id === settlementId && inScope(tenant, s));
      if (!settlement) {
        throw new DomainError('NOT_FOUND', 'La liquidación no existe en la sede.');
      }
      if (settlement.status === 'VOIDED') {
        throw new DomainError('ALREADY_VOIDED', 'La liquidación ya está anulada.');
      }
      const cleanReason = reason.trim();
      if (cleanReason.length < MIN_REASON || cleanReason.length > MAX_REASON) {
        throw new DomainError('VOID_REASON_REQUIRED', 'Describe el motivo de la anulación (de 10 a 255 caracteres).');
      }
      const today = this.store.today;
      this.store.requireOpenPeriod(tenant.congregationId, today);
      const number = this.store.voucherCode(settlement.voucherId);

      for (const line of this.store.cashTransactions.filter(
        (tx) =>
          settlement.voucherId !== null &&
          tx.voucherId === settlement.voucherId &&
          tx.reversalOfId === null &&
          !this.store.isReversed(tx.id),
      )) {
        this.store.reverseCashTransaction({
          transactionId: line.id,
          postedOn: today,
          createdById: tenant.userId,
          description: `Reversa por anulación de la liquidación ${number}`,
        });
      }
      const released = this.store.contributions.filter((c) => c.titheSettlementId === settlement.id);
      for (const contribution of released) {
        this.store.replace(this.store.contributions, { ...contribution, titheSettlementId: null });
      }
      if (settlement.voucherId !== null) {
        this.store.voidVoucher(settlement.voucherId, cleanReason);
      }
      const voided = this.store.replace(this.store.titheSettlements, {
        ...settlement,
        status: 'VOIDED',
        voidedById: tenant.userId,
        voidedAt: this.store.nowIso(),
        voidReason: cleanReason,
      });
      this.audit(tenant, voided.id, 'TITHE_SETTLEMENT_VOIDED', {
        status: { from: 'ISSUED', to: 'VOIDED' },
        number: { from: number, to: number },
        grossTithe: { from: voided.grossTithe, to: voided.grossTithe },
        releasedContributions: { from: null, to: released.length },
      });
      return this.toRow(voided);
    });
  }

  // --- Rules ---------------------------------------------------------------------------------------

  private compute(tenant: SedeTenant, range: TitheRange): TithePreview {
    this.assertRange(tenant, range);
    const rule = ruleInEffect(this.store.titheSettlementRules, tenant.denominationId, this.store.today);
    if (!rule) {
      throw new DomainError('RULE_NOT_FOUND', 'La denominación no tiene porcentajes de liquidación vigentes.');
    }
    const inRange = this.titheContributions(tenant, range);
    const tithes = inRange.filter(isSettleable).sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id);
    const grossTithe = roundMoney(tithes.reduce((sum, c) => sum + c.amount, 0));
    const allocation = allocateTithe(grossTithe, rule);
    const congregationName = this.store.congregationName(tenant.congregationId);
    const components = this.components(tenant, congregationName, rule, allocation);
    return {
      from: range.from,
      to: range.to,
      congregationName,
      count: tithes.length,
      contributorCount: new Set(tithes.filter((c) => c.personId !== null).map((c) => c.personId)).size,
      anonymousCount: tithes.filter((c) => c.personId === null).length,
      excludedCount: inRange.filter((c) => c.status === 'VOIDED').length,
      grossTithe,
      rule: toRuleView(rule),
      components,
      componentsTotal: roundMoney(components.reduce((sum, c) => sum + c.amount, 0)),
      contributions: tithes.map((c) => this.toContributionRow(c)),
      nextNumber: voucherCode(
        VOUCHER_TYPES.titheSettlement,
        this.store.nextVoucherNumber(tenant.congregationId, VOUCHER_TYPES.titheSettlement),
        this.store.today,
      ),
    };
  }

  private assertRange(tenant: SedeTenant, { from, to }: TitheRange): void {
    if (!ISO_DATE.test(from) || !ISO_DATE.test(to)) {
      throw new DomainError('INVALID_RANGE', 'Indica las dos fechas del rango.');
    }
    if (from > to) {
      throw new DomainError('INVALID_RANGE', 'La fecha «hasta» debe ser igual o posterior a la fecha «desde».');
    }
    if (to > this.store.today) {
      throw new DomainError('FUTURE_RANGE', 'La fecha «hasta» no puede ser posterior a hoy.');
    }
    const overlapping = this.store.titheSettlements.find(
      (s) => inScope(tenant, s) && s.status === 'ISSUED' && from <= s.coveredTo && to >= s.coveredFrom,
    );
    if (overlapping) {
      throw new DomainError(
        'OVERLAPPING_SETTLEMENT',
        `El rango se solapa con la liquidación ${this.store.voucherCode(overlapping.voucherId)} (${displayDate(overlapping.coveredFrom)} – ${displayDate(overlapping.coveredTo)}). Elige fechas posteriores al ${displayDate(overlapping.coveredTo)}.`,
      );
    }
  }

  /** Every TITHE contribution of the sede received in the range (any status). */
  private titheContributions(tenant: SedeTenant, { from, to }: TitheRange): Contribution[] {
    return this.store.contributions.filter(
      (c) =>
        inScope(tenant, c) &&
        c.receivedOn >= from &&
        c.receivedOn <= to &&
        this.store.contributionType(c.denominationId, c.contributionTypeId)?.category === 'TITHE',
    );
  }

  private components(
    tenant: SedeTenant,
    congregationName: string,
    rule: TitheSettlementRule,
    allocation: TitheAllocation,
  ): TitheComponent[] {
    const rates = effectiveRates(rule);
    const denomination = this.db.denominations.find((d) => d.id === tenant.denominationId)?.name ?? 'Denominación';
    const localFund = this.store.funds.find((f) => f.denominationId === tenant.denominationId && f.isActive)?.name ?? 'Fondo local';
    return [
      {
        key: 'NATIONAL',
        name: 'Participación nacional (diezmo de diezmos)',
        target: `${denomination} · cuenta por pagar`,
        rate: rates.nationalShare,
        rateLabel: percent(rule.nationalShareRate),
        amount: allocation.nationalShare,
      },
      {
        key: 'LOCAL_FUND',
        name: 'Fondo local',
        target: `${localFund} · ${congregationName}`,
        rate: rates.localFundShare,
        rateLabel: `${percent(rule.localFundRate)} del neto (${percent(rates.localFundShare)} del bruto)`,
        amount: allocation.localFundShare,
      },
      {
        key: 'PASTOR',
        name: 'Asignación pastoral',
        target: `Pastor de ${congregationName}`,
        rate: rates.pastorNet,
        rateLabel: `${percent(rates.pastorNet)} del bruto`,
        amount: allocation.pastorNet,
      },
    ];
  }

  /**
   * Resolves and validates what the sede pays (the national share and the pastoral allocation):
   * the account, an active fund and a positive amount. Lines without an account or fund in the
   * chart are skipped; an inactive fund refuses the whole settlement before anything is written.
   */
  private payableLines(tenant: SedeTenant, allocation: TitheAllocation): PayableLine[] {
    const lines: PayableLine[] = [];
    for (const key of PAYABLE_KEYS) {
      const account = this.store
        .postableAccounts(tenant.denominationId, 'EXPENSE')
        .find((a) => a.code === SETTLEMENT_ACCOUNT_CODES[key]);
      const fundId = account?.defaultFundId;
      if (!account || fundId === null || fundId === undefined || allocation[key] <= 0) {
        continue;
      }
      if (!this.store.fund(tenant.denominationId, fundId)?.isActive) {
        throw new DomainError(
          'FUND_INACTIVE',
          `El fondo sugerido de la cuenta ${account.code} está inactivo: cámbialo en Configuración contable antes de liquidar.`,
        );
      }
      lines.push({ key, accountId: account.id, fundId, amount: allocation[key] });
    }
    return lines;
  }

  /** Books the validated payable lines with the settlement voucher. */
  private postPayables(tenant: SedeTenant, settlement: TitheSettlement, lines: readonly PayableLine[]): void {
    const number = this.store.voucherCode(settlement.voucherId);
    for (const line of lines) {
      this.store.postCashTransaction({
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        accountId: line.accountId,
        fundId: line.fundId,
        voucherId: settlement.voucherId,
        direction: 'OUT',
        postedOn: settlement.settledOn,
        amount: line.amount,
        description: `${PAYABLE_DESCRIPTIONS[line.key]} · ${number}`,
        createdById: tenant.userId,
      });
    }
  }

  // --- Projections -----------------------------------------------------------------------------------

  private toRow(settlement: TitheSettlement): TitheSettlementRow {
    return {
      id: settlement.id,
      number: this.store.voucherCode(settlement.voucherId),
      coveredFrom: settlement.coveredFrom,
      coveredTo: settlement.coveredTo,
      settledOn: settlement.settledOn,
      grossTithe: settlement.grossTithe,
      nationalShare: settlement.nationalShare,
      localFundShare: settlement.localFundShare,
      pastorNet: settlement.pastorNet,
      contributionCount: this.store.contributions.filter((c) => c.titheSettlementId === settlement.id).length,
      status: settlement.status,
      voidReason: settlement.voidReason,
    };
  }

  private toContributionRow(contribution: Contribution): TitheContributionRow {
    const person =
      contribution.personId === null ? undefined : this.store.personOption(contribution.denominationId, contribution.personId);
    return {
      id: contribution.id,
      receiptNumber: this.store.voucherCode(contribution.voucherId),
      receivedOn: contribution.receivedOn,
      contributorName: this.store.personName(contribution.personId),
      contributorDetail: person?.memberCode ?? 'Sin documento',
      paymentMethod: contribution.paymentMethod,
      amount: contribution.amount,
    };
  }

  private read<T>(project: (tenant: AccountingTenant) => T): Observable<T> {
    return defer(() => demoResponse(requirePermission(this.auth, PERMISSION, 'consultar la liquidación del diezmo'))).pipe(
      map((tenant) => project(tenant)),
    );
  }

  private audit(
    tenant: AccountingTenant,
    id: number,
    action: string,
    changes: Record<string, { from: string | number | null; to: string | number | null }>,
  ): void {
    this.db.audit({
      userId: tenant.userId,
      denominationId: tenant.denominationId,
      congregationId: tenant.congregationId,
      entity: 'TitheSettlement',
      entityId: String(id),
      action,
      changes,
    });
  }
}

/** Recorded (not voided) and not included in another issued settlement. */
function isSettleable(contribution: Contribution): boolean {
  return contribution.status === 'RECORDED' && contribution.titheSettlementId === null;
}

function allocationOf(preview: TithePreview): TitheAllocation {
  const amount = (key: TitheComponent['key']) => preview.components.find((c) => c.key === key)?.amount ?? 0;
  return { nationalShare: amount('NATIONAL'), localFundShare: amount('LOCAL_FUND'), pastorNet: amount('PASTOR') };
}

function requireSede(tenant: AccountingTenant): SedeTenant {
  if (tenant.congregationId === null) {
    throw new DomainError('CONGREGATION_REQUIRED', 'Selecciona una sede para liquidar su diezmo.');
  }
  return { ...tenant, congregationId: tenant.congregationId };
}

function toRuleView(rule: TitheSettlementRule): { effectiveFrom: string; nationalShareRate: number; localFundRate: number } {
  return { effectiveFrom: rule.effectiveFrom, nationalShareRate: rule.nationalShareRate, localFundRate: rule.localFundRate };
}

/** 0.27 → "27 %", 0.315 → "31,5 %". */
function percent(rate: number): string {
  const value = Math.round(rate * 1000) / 10;
  return `${String(value).replace('.', ',')} %`;
}

function displayDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
