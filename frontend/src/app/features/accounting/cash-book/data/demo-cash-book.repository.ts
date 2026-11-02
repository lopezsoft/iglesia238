import { Injectable, inject } from '@angular/core';
import { Observable, defer, map } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { monthLabel, monthRange, roundMoney, voucherCode } from '../../data/accounting-rules';
import { AccountingTenant, inScope, requirePermission, writeTenant } from '../../data/accounting-tenant';
import {
  Account,
  AccountingPeriod,
  CASH_DIRECTIONS,
  CashTransaction,
  Contribution,
  VOUCHER_TYPES,
} from '../../data/accounting.models';
import {
  CashBookOptions,
  CashBookQuery,
  CashBookRow,
  CashBookView,
  CashMovementReceipt,
  CashPeriodOption,
  ConsolidationGroup,
  ConsolidationPreview,
  ConsolidationResult,
  PendingConsolidation,
  RecordCashTransactionCommand,
  ReversalBlock,
  ReverseCashTransactionCommand,
} from './cash-book.models';
import { CashBookRepository } from './cash-book.repository';

const PERMISSION = 'cash-transactions.write';
const MAX_AMOUNT = 999_999_999_999.99;
const MIN_DESCRIPTION = 3;
const MAX_DESCRIPTION = 255;
const MIN_REASON = 10;
const MAX_REASON = 200;

type SedeTenant = AccountingTenant & { readonly congregationId: number };

interface ContributionTarget {
  readonly contribution: Contribution;
  readonly account: Account;
  readonly fundId: number;
}

/**
 * Demo adapter of the cash book over the shared AccountingDemoStore. It enforces the rules of
 * the API: open periods only and never after today, postable accounts of the direction's nature,
 * reversals instead of edits (at most one per line), sequential closing of months already ended
 * and contribution consolidation.
 */
@Injectable()
export class DemoCashBookRepository extends CashBookRepository {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AccountingDemoStore);
  private readonly db = inject(DemoDatabase);

  constructor() {
    super();
    this.store.ensurePendingContributions();
  }

  options(): Observable<CashBookOptions> {
    return this.read((tenant) => ({
      today: this.store.today,
      congregationId: tenant.congregationId,
      congregationName:
        tenant.congregationId === null ? 'todas las sedes' : this.store.congregationName(tenant.congregationId),
      funds: this.store.funds
        .filter((f) => f.denominationId === tenant.denominationId)
        .sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.id - b.id)
        .map((f) => ({ id: f.id, name: f.name, isActive: f.isActive })),
      periods: tenant.congregationId === null ? [] : this.store.periodsOf(tenant.congregationId).map(toPeriodOption),
      accounts: this.store
        .postableAccounts(tenant.denominationId)
        .map((a) => ({ id: a.id, code: a.code, name: a.name, nature: a.nature })),
    }));
  }

  view(query: CashBookQuery): Observable<CashBookView> {
    return this.read((tenant) => {
      const sede = requireSede(tenant);
      const period = this.periodOf(sede, query.periodId);
      const fund = this.store.fund(sede.denominationId, query.fundId);
      if (!fund) {
        throw new DomainError('NOT_FOUND', 'El fondo no existe en la denominación.');
      }
      const balance = this.store.fundBalance(sede.congregationId, fund.id, period);
      const lines = this.store.cashTransactions
        .filter((tx) => inScope(sede, tx) && tx.fundId === fund.id && tx.periodId === period.id)
        .sort((a, b) => a.postedOn.localeCompare(b.postedOn) || a.id - b.id);
      let running = balance.opening;
      const rows = lines.map((tx) => {
        running = roundMoney(running + (tx.direction === 'IN' ? tx.amount : -tx.amount));
        return this.toRow(tx, running);
      });
      const pending = this.pendingOn(sede, this.store.today).filter((t) => t.fundId === fund.id);
      return {
        fundId: fund.id,
        fundName: fund.name,
        fundIsActive: fund.isActive,
        period: toPeriodOption(period),
        ...balance,
        inCount: lines.filter((tx) => tx.direction === 'IN').length,
        outCount: lines.filter((tx) => tx.direction === 'OUT').length,
        rows,
        pendingToday: summarizePending(this.store.today, pending),
        closeBlockedReason: this.closeBlock(sede, period)?.message ?? null,
        nextCashIn: this.nextVoucherCode(sede, VOUCHER_TYPES.cashIn),
        nextCashOut: this.nextVoucherCode(sede, VOUCHER_TYPES.cashOut),
        openRange: this.openRange(sede),
      };
    });
  }

  record(command: RecordCashTransactionCommand): Observable<CashMovementReceipt> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'registrar movimientos de caja');
      if (!CASH_DIRECTIONS.includes(command.direction)) {
        throw new DomainError('INVALID_DIRECTION', 'Indica si el movimiento es una entrada o una salida.');
      }
      const description = command.description.trim();
      if (description.length < MIN_DESCRIPTION || description.length > MAX_DESCRIPTION) {
        throw new DomainError('DESCRIPTION_REQUIRED', 'Describe el movimiento (de 3 a 255 caracteres).');
      }
      const amount = roundMoney(command.amount);
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
        throw new DomainError('INVALID_AMOUNT', 'El valor del movimiento debe ser mayor que cero.');
      }
      const account = this.requirePostableAccount(tenant, command.accountId);
      const expected = command.direction === 'IN' ? 'INCOME' : 'EXPENSE';
      if (account.nature !== expected) {
        throw new DomainError(
          'ACCOUNT_NATURE_MISMATCH',
          command.direction === 'IN'
            ? 'Una entrada se registra en una cuenta de ingreso.'
            : 'Una salida se registra en una cuenta de egreso.',
        );
      }
      this.requireActiveFund(tenant, command.fundId);
      this.requireNotFuture(command.postedOn);
      this.store.requireOpenPeriod(tenant.congregationId, command.postedOn);

      const voucher = this.store.issueVoucher({
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        type: command.direction === 'IN' ? VOUCHER_TYPES.cashIn : VOUCHER_TYPES.cashOut,
        issuedOn: command.postedOn,
      });
      const tx = this.store.postCashTransaction({
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        accountId: account.id,
        fundId: command.fundId,
        voucherId: voucher.id,
        direction: command.direction,
        postedOn: command.postedOn,
        amount,
        description,
        createdById: tenant.userId,
      });
      const code = this.store.voucherCode(voucher.id);
      this.audit(tenant, 'CashTransaction', tx.id, 'CASH_TRANSACTION_POSTED', {
        direction: { from: null, to: tx.direction },
        amount: { from: null, to: tx.amount },
        voucher: { from: null, to: code },
      });
      return { transactionId: tx.id, voucherCode: code, direction: tx.direction, amount: tx.amount };
    });
  }

  reverse(command: ReverseCashTransactionCommand): Observable<CashMovementReceipt> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'reversar movimientos de caja');
      const original = this.store.cashTransactions.find((tx) => tx.id === command.transactionId && inScope(tenant, tx));
      if (!original) {
        throw new DomainError('NOT_FOUND', 'El movimiento no existe en la sede.');
      }
      const reason = command.reason.trim();
      if (reason.length < MIN_REASON || reason.length > MAX_REASON) {
        throw new DomainError('REVERSAL_REASON_REQUIRED', 'Describe el motivo de la reversa (de 10 a 200 caracteres).');
      }
      this.assertReversible(original);
      this.requireNotFuture(command.postedOn);
      this.store.requireOpenPeriod(tenant.congregationId, command.postedOn);

      const consolidation = this.store.isConsolidation(original.id);
      const originalCode = this.store.voucherCode(original.voucherId);
      const voucher = this.store.issueVoucher({
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        type: original.direction === 'IN' ? VOUCHER_TYPES.cashOut : VOUCHER_TYPES.cashIn,
        issuedOn: command.postedOn,
      });
      const reversal = this.store.reverseCashTransaction({
        transactionId: original.id,
        postedOn: command.postedOn,
        createdById: tenant.userId,
        description: `Reversa de ${originalCode}: ${reason}`.slice(0, MAX_DESCRIPTION),
        voucherId: voucher.id,
        allowConsolidation: true,
      });
      // Reversing a consolidation gives its contributions back, so they can be consolidated again
      // (assertReversible refuses it when their period is no longer open).
      const released = consolidation ? this.releaseContributions(original.id) : 0;
      const code = this.store.voucherCode(voucher.id);
      this.audit(tenant, 'CashTransaction', original.id, 'CASH_TRANSACTION_REVERSED', {
        direction: { from: original.direction, to: reversal.direction },
        amount: { from: original.amount, to: reversal.amount },
        voucher: { from: originalCode, to: code },
        releasedContributions: { from: null, to: released },
      });
      return { transactionId: reversal.id, voucherCode: code, direction: reversal.direction, amount: reversal.amount };
    });
  }

  closePeriod(periodId: number): Observable<CashPeriodOption> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'cerrar periodos contables');
      const period = this.periodOf(tenant, periodId);
      if (period.status === 'CLOSED') {
        throw new DomainError('PERIOD_ALREADY_CLOSED', 'El periodo ya está cerrado.');
      }
      const blocked = this.closeBlock(tenant, period);
      if (blocked) {
        throw new DomainError(blocked.code, blocked.message);
      }
      const closed = this.store.replace(this.store.accountingPeriods, {
        ...period,
        status: 'CLOSED',
        closedAt: this.store.nowIso(),
      });
      const next = this.ensureNextPeriod(closed);
      this.audit(tenant, 'AccountingPeriod', closed.id, 'PERIOD_CLOSED', {
        status: { from: 'OPEN', to: 'CLOSED' },
        period: { from: null, to: `${closed.year}-${String(closed.month).padStart(2, '0')}` },
        nextPeriod: { from: null, to: `${next.year}-${String(next.month).padStart(2, '0')}` },
      });
      return toPeriodOption(closed);
    });
  }

  consolidationPreview(date: string): Observable<ConsolidationPreview> {
    return this.read((tenant) => {
      const sede = requireSede(tenant);
      const groups = this.groupPending(this.pendingOn(sede, date));
      return {
        date,
        groups,
        count: groups.reduce((sum, g) => sum + g.count, 0),
        total: roundMoney(groups.reduce((sum, g) => sum + g.amount, 0)),
        nextVoucherCode: this.nextVoucherCode(sede, VOUCHER_TYPES.cashIn, date),
      };
    });
  }

  consolidate(date: string): Observable<ConsolidationResult> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, PERMISSION, 'consolidar aportes');
      if (date > this.store.today) {
        throw new DomainError('FUTURE_DATE', 'La fecha a consolidar no puede ser posterior a hoy.');
      }
      this.store.requireOpenPeriod(tenant.congregationId, date);
      const pending = this.pendingOn(tenant, date);
      if (pending.length === 0) {
        throw new DomainError('NOTHING_TO_CONSOLIDATE', 'No hay aportes pendientes de consolidar en esa fecha.');
      }
      const groups = this.groupPending(pending);
      for (const group of groups) {
        this.requirePostableAccount(tenant, group.accountId);
        this.requireActiveFund(tenant, group.fundId);
      }
      const voucher = this.store.issueVoucher({
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        type: VOUCHER_TYPES.cashIn,
        issuedOn: date,
      });
      for (const group of groups) {
        const tx = this.store.postCashTransaction({
          denominationId: tenant.denominationId,
          congregationId: tenant.congregationId,
          accountId: group.accountId,
          fundId: group.fundId,
          voucherId: voucher.id,
          direction: 'IN',
          postedOn: date,
          amount: group.amount,
          description: `Consolidación de aportes del ${displayDate(date)} (${group.count} ${group.count === 1 ? 'aporte' : 'aportes'})`,
          createdById: tenant.userId,
        });
        for (const target of pending.filter((t) => t.account.id === group.accountId && t.fundId === group.fundId)) {
          this.store.replace(this.store.contributions, { ...target.contribution, cashTransactionId: tx.id });
        }
      }
      const total = roundMoney(groups.reduce((sum, g) => sum + g.amount, 0));
      const code = this.store.voucherCode(voucher.id);
      this.audit(tenant, 'Voucher', voucher.id, 'CONTRIBUTIONS_CONSOLIDATED', {
        voucher: { from: null, to: code },
        contributions: { from: null, to: pending.length },
        movements: { from: null, to: groups.length },
        amount: { from: null, to: total },
      });
      return { voucherCode: code, movements: groups.length, count: pending.length, total };
    });
  }

  // --- Rules ---------------------------------------------------------------------------------------

  private assertReversible(tx: CashTransaction): void {
    switch (this.reversalBlock(tx)) {
      case 'IS_REVERSAL':
      case 'ALREADY_REVERSED':
        throw new DomainError('ALREADY_REVERSED', 'El movimiento ya fue reversado o es una reversa: no admite otra reversa.');
      case 'CONTRIBUTION':
        throw new DomainError('CONTRIBUTION_LINE', 'Este movimiento corresponde a un aporte: anúlalo desde Aportes.');
      case 'TITHE_SETTLEMENT':
        throw new DomainError(
          'SETTLEMENT_LINE',
          'Este movimiento corresponde a una liquidación del diezmo: anula la liquidación.',
        );
      case 'CONSOLIDATION_PERIOD_CLOSED':
        throw new DomainError(
          'CONSOLIDATION_PERIOD_CLOSED',
          'La consolidación agrupa aportes de un periodo cerrado: reversarla los dejaría sin poder consolidarse de nuevo. Registra el ajuste con un movimiento nuevo en el periodo abierto.',
        );
      case null:
        return;
    }
  }

  private reversalBlock(tx: CashTransaction): ReversalBlock | null {
    if (tx.reversalOfId !== null) {
      return 'IS_REVERSAL';
    }
    if (this.store.isReversed(tx.id)) {
      return 'ALREADY_REVERSED';
    }
    const voucher = this.store.voucher(tx.voucherId);
    if (voucher?.type === VOUCHER_TYPES.receipt) {
      return 'CONTRIBUTION';
    }
    if (voucher?.type === VOUCHER_TYPES.titheSettlement) {
      return 'TITHE_SETTLEMENT';
    }
    if (this.consolidatesClosedPeriod(tx)) {
      return 'CONSOLIDATION_PERIOD_CLOSED';
    }
    return null;
  }

  /**
   * True when the line consolidates contributions received in a period that is no longer open:
   * released, they could never be consolidated again (consolidation posts on their own date).
   */
  private consolidatesClosedPeriod(tx: CashTransaction): boolean {
    return (
      this.store.isConsolidation(tx.id) &&
      this.store.contributions.some(
        (c) =>
          c.cashTransactionId === tx.id && this.store.periodFor(tx.congregationId, c.receivedOn)?.status !== 'OPEN',
      )
    );
  }

  /** Why a period cannot be closed yet (code and message), or null when it can. */
  private closeBlock(tenant: SedeTenant, period: AccountingPeriod): { code: string; message: string } | null {
    if (period.status === 'CLOSED') {
      return { code: 'PERIOD_ALREADY_CLOSED', message: 'El periodo ya está cerrado.' };
    }
    const previous = this.previousOpenPeriod(tenant, period);
    if (previous) {
      return {
        code: 'PREVIOUS_PERIOD_OPEN',
        message: `Cierra primero ${monthLabel(previous)}: los periodos se cierran en orden.`,
      };
    }
    const { from, to } = monthRange(period);
    if (to >= this.store.today) {
      return {
        code: 'PERIOD_NOT_ENDED',
        message: `${monthLabel(period)} aún no termina: podrás cerrarlo después del ${displayDate(to)}.`,
      };
    }
    const pending = this.store.contributions.filter(
      (c) => this.isPending(tenant, c) && c.receivedOn >= from && c.receivedOn <= to,
    );
    if (pending.length > 0) {
      return {
        code: 'PENDING_CONSOLIDATION',
        message: `Hay ${pending.length} ${pending.length === 1 ? 'aporte pendiente' : 'aportes pendientes'} de consolidar en el periodo: consolídalos antes de cerrarlo.`,
      };
    }
    return null;
  }

  private previousOpenPeriod(tenant: SedeTenant, period: AccountingPeriod): AccountingPeriod | undefined {
    return this.store
      .periodsOf(tenant.congregationId)
      .filter((p) => p.status === 'OPEN' && (p.year < period.year || (p.year === period.year && p.month < period.month)))
      .at(-1);
  }

  /** Opens the month after a closed period when it does not exist yet. */
  private ensureNextPeriod(period: AccountingPeriod): AccountingPeriod {
    const year = period.month === 12 ? period.year + 1 : period.year;
    const month = period.month === 12 ? 1 : period.month + 1;
    const existing = this.store.accountingPeriods.find(
      (p) => p.congregationId === period.congregationId && p.year === year && p.month === month,
    );
    if (existing) {
      return existing;
    }
    const next: AccountingPeriod = {
      id: this.store.nextId(this.store.accountingPeriods),
      denominationId: period.denominationId,
      congregationId: period.congregationId,
      year,
      month,
      status: 'OPEN',
      closedAt: null,
    };
    this.store.accountingPeriods.push(next);
    return next;
  }

  private releaseContributions(transactionId: number): number {
    const linked = this.store.contributions.filter((c) => c.cashTransactionId === transactionId);
    for (const contribution of linked) {
      this.store.replace(this.store.contributions, { ...contribution, cashTransactionId: null });
    }
    return linked.length;
  }

  private isPending(tenant: SedeTenant, c: Contribution): boolean {
    return inScope(tenant, c) && c.status === 'RECORDED' && c.cashTransactionId === null;
  }

  /** Contributions of a date not consolidated yet, with the account and fund they go to. */
  private pendingOn(tenant: SedeTenant, date: string): ContributionTarget[] {
    return this.store.contributions
      .filter((c) => this.isPending(tenant, c) && c.receivedOn === date)
      .map((contribution) => this.targetOf(contribution))
      .filter((target): target is ContributionTarget => target !== undefined);
  }

  /** The type account and its suggested fund (or the first active fund), as Aportes does. */
  private targetOf(contribution: Contribution): ContributionTarget | undefined {
    const type = this.store.contributionType(contribution.denominationId, contribution.contributionTypeId);
    const account = type ? this.store.account(contribution.denominationId, type.accountId) : undefined;
    const fundId =
      account?.defaultFundId ??
      this.store.funds.find((f) => f.denominationId === contribution.denominationId && f.isActive)?.id;
    return account && fundId !== undefined ? { contribution, account, fundId } : undefined;
  }

  private groupPending(pending: readonly ContributionTarget[]): ConsolidationGroup[] {
    const groups = new Map<string, ConsolidationGroup>();
    for (const { contribution, account, fundId } of pending) {
      const key = `${account.id}:${fundId}`;
      const current = groups.get(key);
      groups.set(key, {
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        fundId,
        fundName: this.store.fund(contribution.denominationId, fundId)?.name ?? '—',
        count: (current?.count ?? 0) + 1,
        amount: roundMoney((current?.amount ?? 0) + contribution.amount),
      });
    }
    return [...groups.values()].sort((a, b) => a.accountCode.localeCompare(b.accountCode) || a.fundId - b.fundId);
  }

  private requirePostableAccount(tenant: AccountingTenant, accountId: number): Account {
    const account = this.store.account(tenant.denominationId, accountId);
    if (!account || !account.isPostable || !account.isActive) {
      throw new DomainError('ACCOUNT_NOT_POSTABLE', 'La cuenta no es imputable: elige una cuenta que reciba movimientos.');
    }
    return account;
  }

  /** Cash lines are never dated after today, like contributions and consolidations. */
  private requireNotFuture(postedOn: string): void {
    if (postedOn > this.store.today) {
      throw new DomainError('FUTURE_DATE', 'La fecha del movimiento no puede ser posterior a hoy.');
    }
  }

  private requireActiveFund(tenant: AccountingTenant, fundId: number): void {
    const fund = this.store.fund(tenant.denominationId, fundId);
    if (!fund || !fund.isActive) {
      throw new DomainError('FUND_INACTIVE', 'El fondo no existe o está inactivo.');
    }
  }

  // --- Projections -----------------------------------------------------------------------------------

  private toRow(tx: CashTransaction, balance: number): CashBookRow {
    const account = this.store.account(tx.denominationId, tx.accountId);
    const reversal = this.store.cashTransactions.find((r) => r.reversalOfId === tx.id);
    const original =
      tx.reversalOfId === null ? undefined : this.store.cashTransactions.find((r) => r.id === tx.reversalOfId);
    const related = original ?? reversal;
    return {
      id: tx.id,
      postedOn: tx.postedOn,
      voucherCode: this.store.voucherCode(tx.voucherId),
      accountCode: account?.code ?? '—',
      accountName: account?.name ?? '—',
      description: tx.description,
      direction: tx.direction,
      amount: tx.amount,
      balance,
      status: original ? 'REVERSAL' : reversal ? 'REVERSED' : 'POSTED',
      relatedVoucherCode: related ? this.store.voucherCode(related.voucherId) : null,
      reversalBlock: this.reversalBlock(tx),
    };
  }

  private periodOf(tenant: SedeTenant, periodId: number): AccountingPeriod {
    const period = this.store.accountingPeriods.find(
      (p) => p.id === periodId && p.denominationId === tenant.denominationId && p.congregationId === tenant.congregationId,
    );
    if (!period) {
      throw new DomainError('NOT_FOUND', 'El periodo contable no existe en la sede.');
    }
    return period;
  }

  private openRange(tenant: SedeTenant): { min: string; max: string } | null {
    const open = this.store.periodsOf(tenant.congregationId).filter((p) => p.status === 'OPEN');
    if (open.length === 0) {
      return null;
    }
    const min = monthRange(open.at(-1)!).from;
    const lastOpenDay = monthRange(open[0]).to;
    // No movement is dated after today.
    const max = lastOpenDay < this.store.today ? lastOpenDay : this.store.today;
    return max < min ? null : { min, max };
  }

  private nextVoucherCode(tenant: SedeTenant, type: 'CI' | 'CE', issuedOn = this.store.today): string {
    return voucherCode(type, this.store.nextVoucherNumber(tenant.congregationId, type), issuedOn);
  }

  /** Every call needs the module permission (the cash book has no separate read permission). */
  private read<T>(project: (tenant: AccountingTenant) => T): Observable<T> {
    return defer(() => demoResponse(requirePermission(this.auth, PERMISSION, 'consultar el libro de caja'))).pipe(
      map((tenant) => project(tenant)),
    );
  }

  private audit(
    tenant: AccountingTenant,
    entity: string,
    id: number,
    action: string,
    changes: Record<string, { from: string | number | null; to: string | number | null }>,
  ): void {
    this.db.audit({
      userId: tenant.userId,
      denominationId: tenant.denominationId,
      congregationId: tenant.congregationId,
      entity,
      entityId: String(id),
      action,
      changes,
    });
  }
}

function requireSede(tenant: AccountingTenant): SedeTenant {
  if (tenant.congregationId === null) {
    throw new DomainError('CONGREGATION_REQUIRED', 'Selecciona una sede para consultar su libro de caja.');
  }
  return { ...tenant, congregationId: tenant.congregationId };
}

function toPeriodOption(period: AccountingPeriod): CashPeriodOption {
  const { from, to } = monthRange(period);
  return {
    id: period.id,
    year: period.year,
    month: period.month,
    status: period.status,
    label: monthLabel(period),
    closedAt: period.closedAt,
    from,
    to,
  };
}

function summarizePending(date: string, pending: readonly ContributionTarget[]): PendingConsolidation {
  return {
    date,
    count: pending.length,
    amount: roundMoney(pending.reduce((sum, t) => sum + t.contribution.amount, 0)),
  };
}

/** '2026-11-02' → '02/11/2026' (descriptions are stored text, not formatted by the UI). */
function displayDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day}/${month}/${year}`;
}
