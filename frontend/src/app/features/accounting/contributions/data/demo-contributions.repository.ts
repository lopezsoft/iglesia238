import { Injectable, inject } from '@angular/core';
import { Observable, defer, map } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { formatMoney } from '../../../../shared/pipes/money.pipe';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import {
  YearMonth,
  contributionDisplayStatus,
  monthLabel,
  monthRange,
  roundMoney,
  vowPledgeCode,
} from '../../data/accounting-rules';
import { AccountingTenant, inScope, requirePermission, writeTenant } from '../../data/accounting-tenant';
import {
  CONTRIBUTION_CATEGORIES,
  CashTransaction,
  Contribution,
  ContributionCategory,
  METHODS_WITH_REFERENCE,
  PAYMENT_METHODS,
  PeriodOption,
  PersonOption,
  TitheSettlement,
  VOUCHER_TYPES,
  VowPledge,
} from '../../data/accounting.models';
import {
  CategorySummary,
  ContributionFormOptions,
  ContributionMonth,
  ContributionRow,
  ContributionVoidBlock,
  RecordContributionCommand,
  VowPaymentTarget,
  VowPledgeOption,
} from './contributions.models';
import { ContributionsRepository } from './contributions.repository';

const READ = 'contributions.read';
const WRITE = 'contributions.write';
const MAX_AMOUNT = 999_999_999_999.99;
const MIN_VOID_REASON = 10;

/**
 * Demo adapter of Aportes over the shared AccountingDemoStore. Recording a contribution issues
 * its receipt (REC); the cash book later consolidates it into one movement. Voiding keeps the
 * row and voids the receipt; a contribution posted with its own receipt line gets that line
 * reversed today, and one inside a consolidation is refused (the cash book reverses it first).
 * Tithes cannot be dated inside the range of an issued tithe settlement.
 */
@Injectable()
export class DemoContributionsRepository extends ContributionsRepository {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AccountingDemoStore);
  private readonly db = inject(DemoDatabase);

  formOptions(): Observable<ContributionFormOptions> {
    return this.read((tenant) => {
      const today = this.store.today;
      const congregationIds =
        tenant.congregationId === null ? this.store.congregationIdsOf(tenant.denominationId) : [tenant.congregationId];
      // One option per month; denomination-wide, a month is open when any sede has it open.
      const periods = new Map<string, PeriodOption>();
      for (const period of this.store.accountingPeriods) {
        if (period.denominationId !== tenant.denominationId || !congregationIds.includes(period.congregationId)) {
          continue;
        }
        const key = `${period.year}-${period.month}`;
        const open = periods.get(key)?.status === 'OPEN' || period.status === 'OPEN';
        periods.set(key, { year: period.year, month: period.month, status: open ? 'OPEN' : 'CLOSED', label: monthLabel(period) });
      }
      const options = [...periods.values()].sort((a, b) => b.year - a.year || b.month - a.month);
      const open = tenant.congregationId === null ? [] : options.filter((p) => p.status === 'OPEN');
      const firstOpen = open.at(-1);
      return {
        today,
        congregationScoped: tenant.congregationId !== null,
        scopeLabel:
          tenant.congregationId === null ? 'todas las sedes' : this.store.congregationName(tenant.congregationId),
        types: this.store.contributionTypes
          .filter((t) => t.denominationId === tenant.denominationId && t.isActive)
          .map((t) => ({ id: t.id, name: t.name, category: t.category })),
        periods: options,
        minDate: firstOpen ? monthRange(firstOpen).from : null,
        maxDate: open.length > 0 ? today : null,
        settledTitheRanges:
          tenant.congregationId === null
            ? []
            : this.store.titheSettlements
                .filter((s) => inScope(tenant, s) && s.status === 'ISSUED')
                .map((s) => ({ from: s.coveredFrom, to: s.coveredTo })),
        nextReceiptNumber:
          tenant.congregationId === null
            ? null
            : `${VOUCHER_TYPES.receipt}-${today.slice(0, 4)}-${String(
                this.store.nextVoucherNumber(tenant.congregationId, VOUCHER_TYPES.receipt),
              ).padStart(5, '0')}`,
      };
    });
  }

  listMonth(period: YearMonth): Observable<ContributionMonth> {
    return this.read((tenant) => {
      const { from, to } = monthRange(period);
      const rows = this.store.contributions
        .filter((c) => inScope(tenant, c) && c.receivedOn >= from && c.receivedOn <= to)
        .map((c) => this.toRow(c))
        .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.receiptNumber.localeCompare(a.receiptNumber));
      const valid = rows.filter((r) => r.status !== 'VOIDED');
      const total = roundMoney(valid.reduce((sum, r) => sum + r.amount, 0));
      const sedePeriod =
        tenant.congregationId === null ? undefined : this.store.periodFor(tenant.congregationId, from);
      return {
        year: period.year,
        month: period.month,
        label: monthLabel(period),
        periodStatus: sedePeriod?.status ?? null,
        rows,
        summary: summarize(valid, total),
        total,
        voidedCount: rows.length - valid.length,
      };
    });
  }

  searchPersons(query: string): Observable<PersonOption[]> {
    return this.read((tenant) => this.store.searchPersons(tenant.denominationId, query, tenant.congregationId));
  }

  openPledges(personId: number, contributionTypeId: number): Observable<VowPledgeOption[]> {
    return this.read((tenant) =>
      this.store.vowPledges
        .filter(
          (p) =>
            p.denominationId === tenant.denominationId &&
            p.personId === personId &&
            p.contributionTypeId === contributionTypeId &&
            p.status === 'ACTIVE' &&
            this.balanceOf(p) > 0,
        )
        .map((p) => this.pledgeOption(p)),
    );
  }

  vowPaymentTarget(pledgeId: number): Observable<VowPaymentTarget> {
    return this.read((tenant) => {
      const pledge = this.store.vowPledge(tenant.denominationId, pledgeId);
      const person = pledge ? this.store.personOption(tenant.denominationId, pledge.personId) : undefined;
      if (!pledge || !person) {
        throw new DomainError('NOT_FOUND', 'La promesa de voto no existe.');
      }
      if (pledge.status !== 'ACTIVE' || this.balanceOf(pledge) <= 0) {
        throw new DomainError('VOW_PLEDGE_CLOSED', 'La promesa ya está cumplida o cancelada: no admite abonos.');
      }
      return { pledge: this.pledgeOption(pledge), person };
    });
  }

  record(command: RecordContributionCommand): Observable<ContributionRow> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, WRITE, 'registrar aportes');
      const type = this.store.contributionType(tenant.denominationId, command.contributionTypeId);
      if (!type || !type.isActive) {
        throw new DomainError('TYPE_INACTIVE', 'El tipo de aporte no existe o está inactivo.');
      }
      const amount = roundMoney(command.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
        throw new DomainError('INVALID_AMOUNT', 'El valor del aporte debe ser mayor que cero.');
      }
      if (command.receivedOn > this.store.today) {
        throw new DomainError('FUTURE_DATE', 'La fecha del aporte no puede ser posterior a hoy.');
      }
      this.store.requireOpenPeriod(tenant.congregationId, command.receivedOn);
      if (type.category === 'TITHE' && this.settledRangeOf(tenant.congregationId, command.receivedOn)) {
        // A tithe inside an issued settlement range could never be settled (ranges never overlap).
        throw new DomainError(
          'TITHE_RANGE_SETTLED',
          'Los diezmos de esa fecha ya fueron liquidados: anula la liquidación o usa otra fecha.',
        );
      }
      if (!PAYMENT_METHODS.includes(command.paymentMethod)) {
        throw new DomainError('INVALID_PAYMENT_METHOD', 'El medio de pago no es válido.');
      }
      const reference = command.paymentReference?.trim() || null;
      if (METHODS_WITH_REFERENCE.includes(command.paymentMethod) && !reference) {
        throw new DomainError('REFERENCE_REQUIRED', 'La referencia es obligatoria para transferencia, datáfono y consignación.');
      }
      if ((reference?.length ?? 0) > 80) {
        throw new DomainError('REFERENCE_TOO_LONG', 'La referencia admite máximo 80 caracteres.');
      }
      const notes = command.notes?.trim() || null;
      if ((notes?.length ?? 0) > 255) {
        throw new DomainError('NOTES_TOO_LONG', 'La descripción admite máximo 255 caracteres.');
      }
      if (command.personId !== null && !this.store.personOption(tenant.denominationId, command.personId)) {
        throw new DomainError('PERSON_NOT_FOUND', 'La persona no pertenece a la denominación.');
      }
      const pledge = this.checkVow(tenant, type.category, command, amount);

      if (!this.store.account(tenant.denominationId, type.accountId)) {
        throw new DomainError('ACCOUNT_NOT_POSTABLE', 'El tipo de aporte no tiene una cuenta imputable configurada.');
      }
      const receipt = this.store.issueVoucher({
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        type: VOUCHER_TYPES.receipt,
        issuedOn: command.receivedOn,
      });
      // The cash book consolidates the day's contributions into one movement (E-04), so a new
      // contribution has no cash line yet.
      const contribution: Contribution = {
        id: this.store.nextId(this.store.contributions),
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        contributionTypeId: type.id,
        personId: command.personId,
        vowPledgeId: pledge?.id ?? null,
        cashTransactionId: null,
        voucherId: receipt.id,
        titheSettlementId: null,
        receivedOn: command.receivedOn,
        amount,
        paymentMethod: command.paymentMethod,
        paymentReference: reference,
        notes: command.personId === null ? notes : null,
        status: 'RECORDED',
        recordedById: tenant.userId,
        voidedById: null,
        voidedAt: null,
        voidReason: null,
        createdAt: this.store.nowIso(),
      };
      this.store.contributions.push(contribution);
      if (pledge) {
        this.store.refreshVowPledgeStatus(pledge.id);
      }
      this.audit(tenant, contribution.id, 'CONTRIBUTION_RECORDED', {
        status: { from: null, to: 'RECORDED' },
        amount: { from: null, to: amount },
        category: { from: null, to: type.category },
        receipt: { from: null, to: this.store.voucherCode(receipt.id) },
      });
      return this.toRow(contribution);
    });
  }

  void(contributionId: number, reason: string): Observable<ContributionRow> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, WRITE, 'anular aportes');
      const contribution = this.store.contributions.find((c) => c.id === contributionId && inScope(tenant, c));
      if (!contribution) {
        throw new DomainError('NOT_FOUND', 'El aporte no existe en la sede.');
      }
      if (contribution.status === 'VOIDED') {
        throw new DomainError('ALREADY_VOIDED', 'El aporte ya está anulado.');
      }
      if (contribution.titheSettlementId !== null) {
        throw new DomainError(
          'CONTRIBUTION_SETTLED',
          'Un aporte liquidado no se puede anular: ya forma parte de una liquidación del diezmo.',
        );
      }
      const cleanReason = reason.trim();
      if (cleanReason.length < MIN_VOID_REASON || cleanReason.length > 255) {
        throw new DomainError('VOID_REASON_REQUIRED', 'Describe el motivo de la anulación (de 10 a 255 caracteres).');
      }
      const receipt = this.store.voucherCode(contribution.voucherId);
      if (this.voidBlockOf(contribution) === 'CONSOLIDATED') {
        // Corrections go through the cash book: reversing the consolidation releases the contributions.
        throw new DomainError(
          'CONTRIBUTION_CONSOLIDATED',
          'El aporte ya está consolidado en el libro de caja: reversa primero la consolidación desde el Libro de caja y luego anúlalo.',
        );
      }
      const ownLine = this.ownCashLine(contribution);
      if (ownLine) {
        // Posted with its own receipt: the line is reversed today, before any other change, so a
        // failure (e.g. today's period closed) leaves the contribution untouched.
        this.store.reverseCashTransaction({
          transactionId: ownLine.id,
          postedOn: this.store.today,
          createdById: tenant.userId,
          description: `Reversa por anulación del aporte ${receipt}`,
        });
      }
      if (contribution.voucherId !== null) {
        this.store.voidVoucher(contribution.voucherId, cleanReason);
      }
      const voided = this.store.replace(this.store.contributions, {
        ...contribution,
        status: 'VOIDED',
        voidedById: tenant.userId,
        voidedAt: this.store.nowIso(),
        voidReason: cleanReason,
      });
      if (voided.vowPledgeId !== null) {
        this.store.refreshVowPledgeStatus(voided.vowPledgeId);
      }
      this.audit(tenant, voided.id, 'CONTRIBUTION_VOIDED', {
        status: { from: 'RECORDED', to: 'VOIDED' },
        amount: { from: voided.amount, to: voided.amount },
        receipt: { from: receipt, to: receipt },
      });
      return this.toRow(voided);
    });
  }

  // --- Rules ---------------------------------------------------------------------------------------

  /** Why "Anular" is refused (settled, or part of a consolidation), or null when it is allowed. */
  private voidBlockOf(contribution: Contribution): ContributionVoidBlock | null {
    if (contribution.status === 'VOIDED') {
      return null;
    }
    if (contribution.titheSettlementId !== null) {
      return 'SETTLED';
    }
    if (contribution.cashTransactionId !== null && this.store.isConsolidation(contribution.cashTransactionId)) {
      return 'CONSOLIDATED';
    }
    return null;
  }

  /** The contribution's own cash line (posted with its receipt), when it is still not reversed. */
  private ownCashLine(contribution: Contribution): CashTransaction | undefined {
    const line = this.store.cashTransactions.find((tx) => tx.id === contribution.cashTransactionId);
    return line && line.reversalOfId === null && !this.store.isReversed(line.id) ? line : undefined;
  }

  /** ISSUED tithe settlement of the sede whose range contains the date, if any. */
  private settledRangeOf(congregationId: number, date: string): TitheSettlement | undefined {
    return this.store.titheSettlements.find(
      (s) => s.congregationId === congregationId && s.status === 'ISSUED' && s.coveredFrom <= date && date <= s.coveredTo,
    );
  }

  /** A vow payment needs a pledge of the same person and type, still open, within its balance. */
  private checkVow(
    tenant: AccountingTenant,
    category: ContributionCategory,
    command: RecordContributionCommand,
    amount: number,
  ): VowPledge | null {
    if (category !== 'VOW') {
      if (command.vowPledgeId !== null) {
        throw new DomainError('VOW_PLEDGE_NOT_ALLOWED', 'Solo los aportes de tipo Voto se asocian a una promesa.');
      }
      return null;
    }
    if (command.personId === null) {
      throw new DomainError('VOW_REQUIRES_PERSON', 'Los abonos a votos requieren un aportante nominal.');
    }
    if (command.vowPledgeId === null) {
      throw new DomainError('VOW_PLEDGE_REQUIRED', 'Selecciona la promesa de voto a la que se abona.');
    }
    const pledge = this.store.vowPledge(tenant.denominationId, command.vowPledgeId);
    if (!pledge || pledge.personId !== command.personId || pledge.contributionTypeId !== command.contributionTypeId) {
      throw new DomainError(
        'VOW_PLEDGE_MISMATCH',
        'La promesa no corresponde a la misma persona y al mismo tipo de aporte.',
      );
    }
    const balance = this.balanceOf(pledge);
    if (pledge.status !== 'ACTIVE' || balance <= 0) {
      throw new DomainError('VOW_PLEDGE_CLOSED', 'La promesa ya está cumplida o cancelada: no admite abonos.');
    }
    if (amount > balance) {
      throw new DomainError(
        'VOW_PAYMENT_EXCEEDS_BALANCE',
        `El abono supera el saldo pendiente de la promesa (${formatMoney(balance)}).`,
      );
    }
    return pledge;
  }

  // --- Projections -----------------------------------------------------------------------------------

  private toRow(contribution: Contribution): ContributionRow {
    const type = this.store.contributionTypes.find((t) => t.id === contribution.contributionTypeId);
    const pledge =
      contribution.vowPledgeId === null
        ? undefined
        : this.store.vowPledges.find((p) => p.id === contribution.vowPledgeId);
    const person =
      contribution.personId === null
        ? undefined
        : this.store.personOption(contribution.denominationId, contribution.personId);
    let detail: string;
    if (person) {
      detail = pledge ? `${person.memberCode} · Abono a ${vowPledgeCode(pledge)}` : person.memberCode;
    } else {
      detail = contribution.notes ?? 'Sin datos del aportante';
    }
    return {
      id: contribution.id,
      receiptNumber: this.store.voucherCode(contribution.voucherId),
      receivedOn: contribution.receivedOn,
      contributionTypeId: contribution.contributionTypeId,
      typeName: type?.name ?? '—',
      category: type?.category ?? 'OTHER',
      personId: contribution.personId,
      contributorName: this.store.personName(contribution.personId) ?? (contribution.notes ? 'Colecta agregada' : null),
      contributorDetail: detail,
      vowPledgeId: contribution.vowPledgeId,
      paymentMethod: contribution.paymentMethod,
      paymentReference: contribution.paymentReference,
      amount: contribution.amount,
      status: contributionDisplayStatus(contribution),
      voidBlock: this.voidBlockOf(contribution),
      voidReason: contribution.voidReason,
      congregationName: this.store.congregationName(contribution.congregationId),
    };
  }

  private pledgeOption(pledge: VowPledge): VowPledgeOption {
    const balance = this.balanceOf(pledge);
    const parts = [vowPledgeCode(pledge), pledge.description, `saldo ${formatMoney(balance)}`].filter(Boolean);
    return {
      id: pledge.id,
      label: parts.join(' · '),
      personId: pledge.personId,
      contributionTypeId: pledge.contributionTypeId,
      balance,
    };
  }

  private balanceOf(pledge: VowPledge): number {
    return roundMoney(pledge.pledgedAmount - this.store.vowPaid(pledge.id));
  }

  /** Reads need contributions.read: contributions are very sensitive data. */
  private read<T>(project: (tenant: AccountingTenant) => T): Observable<T> {
    return defer(() => demoResponse(requirePermission(this.auth, READ, 'consultar aportes'))).pipe(
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
      entity: 'Contribution',
      entityId: String(id),
      action,
      changes,
    });
  }
}

/** Per-category totals of the valid contributions of a month (always the four main ones). */
function summarize(rows: readonly ContributionRow[], total: number): CategorySummary[] {
  const main: ContributionCategory[] = ['TITHE', 'OFFERING', 'FIRST_FRUITS', 'VOW'];
  return CONTRIBUTION_CATEGORIES.map((category) => {
    const ofCategory = rows.filter((r) => r.category === category);
    const amount = roundMoney(ofCategory.reduce((sum, r) => sum + r.amount, 0));
    return { category, amount, count: ofCategory.length, share: total > 0 ? Math.round((amount / total) * 100) : 0 };
  }).filter((s) => main.includes(s.category) || s.count > 0);
}
