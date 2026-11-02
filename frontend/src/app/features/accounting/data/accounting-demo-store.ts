import { Injectable, inject } from '@angular/core';
import { DemoDatabase } from '../../../core/demo/demo-database';
import { DomainError } from '../../../core/errors/domain-error';
import { personFullName } from '../../../core/models/membership.model';
import { matchesText } from '../../../shared/utils/pagination';
import { ACCOUNTING_DEMO_TODAY, AccountingTables, buildAccountingSeed } from './accounting-demo-seed';
import { seedPendingContributions } from './accounting-pending-contributions';
import {
  FundBalance,
  YearMonth,
  documentHint,
  fundBalance,
  periodFor,
  postableAccounts,
  roundMoney,
  voucherCode,
  vowPaidAmount,
  vowPledgeStatusFor,
} from './accounting-rules';
import {
  Account,
  AccountNature,
  AccountingPeriod,
  CashTransaction,
  ContributionType,
  Fund,
  PersonOption,
  Voucher,
  VoucherType,
  VowPledge,
} from './accounting.models';

interface WithId {
  readonly id: number;
}

/** Fields the caller provides to post a cash line; the store fills ids, period and timestamps. */
export type CashTransactionInput = Omit<CashTransaction, 'id' | 'periodId' | 'createdAt' | 'reversalOfId'>;

const MAX_PERSON_RESULTS = 8;

/**
 * In-memory accounting tables shared by the demo adapters of every accounting screen (setup,
 * contributions, vows, cash book, tithe settlement, budget), so a contribution recorded in one
 * screen shows up in the cash book of another. Only demo adapters may inject it.
 *
 * Tables are public arrays of immutable rows: read them freely, change them only through
 * `replace` / `push` inside a demo adapter command (after validating permissions and rules), or
 * through the posting helpers below, which enforce the invariants of the cash book:
 * - movements only on active, postable accounts and active funds of the same denomination;
 * - `postedOn` inside an OPEN period of the congregation;
 * - amounts strictly positive; reversals with the opposite direction, at most one per line.
 */
@Injectable({ providedIn: 'root' })
export class AccountingDemoStore {
  private readonly db = inject(DemoDatabase);
  private readonly tables: AccountingTables = buildAccountingSeed(this.db.members);
  private readonly extensions = new Set<string>();

  /** Demo calendar: the seed is anchored to this date ('YYYY-MM-DD'). */
  readonly today = ACCOUNTING_DEMO_TODAY;

  readonly funds = this.tables.funds;
  readonly accounts = this.tables.accounts;
  readonly contributionTypes = this.tables.contributionTypes;
  readonly fundOpeningBalances = this.tables.fundOpeningBalances;
  readonly accountingPeriods = this.tables.accountingPeriods;
  readonly vouchers = this.tables.vouchers;
  readonly cashTransactions = this.tables.cashTransactions;
  readonly vowPledges = this.tables.vowPledges;
  readonly contributions = this.tables.contributions;
  readonly titheSettlementRules = this.tables.titheSettlementRules;
  readonly titheSettlements = this.tables.titheSettlements;
  readonly budgets = this.tables.budgets;
  readonly budgetLines = this.tables.budgetLines;

  // --- Generic table helpers --------------------------------------------------------------------

  nextId(table: readonly WithId[]): number {
    return this.db.nextId(table);
  }

  /** Replaces the row with the same id (rows are immutable). */
  replace<T extends WithId>(table: T[], row: T): T {
    return this.db.replace(table, row);
  }

  /** Current instant for createdAt / voidedAt / closedAt columns. */
  nowIso(): string {
    return new Date().toISOString();
  }

  // --- Lookups (undefined when the row does not exist or belongs to another denomination) --------

  fund(denominationId: number, id: number): Fund | undefined {
    return this.funds.find((row) => row.id === id && row.denominationId === denominationId);
  }

  account(denominationId: number, id: number): Account | undefined {
    return this.accounts.find((row) => row.id === id && row.denominationId === denominationId);
  }

  contributionType(denominationId: number, id: number): ContributionType | undefined {
    return this.contributionTypes.find((row) => row.id === id && row.denominationId === denominationId);
  }

  vowPledge(denominationId: number, id: number): VowPledge | undefined {
    return this.vowPledges.find((row) => row.id === id && row.denominationId === denominationId);
  }

  voucher(id: number | null): Voucher | undefined {
    return id === null ? undefined : this.vouchers.find((row) => row.id === id);
  }

  /** Display number of a voucher (REC-2026-01872) or '—'. */
  voucherCode(id: number | null): string {
    const voucher = this.voucher(id);
    return voucher ? voucherCode(voucher.type, voucher.number, voucher.issuedOn) : '—';
  }

  // --- Periods -----------------------------------------------------------------------------------

  periodFor(congregationId: number, date: string): AccountingPeriod | undefined {
    return periodFor(this.accountingPeriods, congregationId, date);
  }

  /** Periods of a congregation, newest first. */
  periodsOf(congregationId: number): AccountingPeriod[] {
    return this.accountingPeriods
      .filter((p) => p.congregationId === congregationId)
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }

  /** The OPEN period containing `date`, or a DomainError PERIOD_NOT_FOUND / PERIOD_CLOSED. */
  requireOpenPeriod(congregationId: number, date: string): AccountingPeriod {
    const period = this.periodFor(congregationId, date);
    if (!period) {
      throw new DomainError('PERIOD_NOT_FOUND', 'No existe un periodo contable para esa fecha en la sede.');
    }
    if (period.status !== 'OPEN') {
      throw new DomainError('PERIOD_CLOSED', 'El periodo contable de esa fecha está cerrado.');
    }
    return period;
  }

  // --- Chart of accounts and funds -------------------------------------------------------------------

  postableAccounts(denominationId: number, nature?: AccountNature): Account[] {
    return postableAccounts(this.accounts, denominationId, nature);
  }

  /** True when the account has cash lines or budget lines (it can no longer be deleted). */
  accountHasMovements(accountId: number): boolean {
    return (
      this.cashTransactions.some((tx) => tx.accountId === accountId) ||
      this.budgetLines.some((line) => line.accountId === accountId)
    );
  }

  /** Opening balance + movements of a fund in a congregation for a month. */
  fundBalance(congregationId: number, fundId: number, period: YearMonth): FundBalance {
    return fundBalance(this.fundOpeningBalances, this.cashTransactions, congregationId, fundId, period);
  }

  // --- Vouchers and cash book ------------------------------------------------------------------------

  /** Issues the next consecutive voucher of a type in a congregation. */
  issueVoucher(input: {
    denominationId: number;
    congregationId: number;
    type: VoucherType;
    issuedOn: string;
    signerId?: number | null;
  }): Voucher {
    const last = this.vouchers
      .filter((v) => v.congregationId === input.congregationId && v.type === input.type)
      .reduce((max, v) => Math.max(max, v.number), 0);
    const voucher: Voucher = {
      id: this.nextId(this.vouchers),
      denominationId: input.denominationId,
      congregationId: input.congregationId,
      type: input.type,
      number: last + 1,
      issuedOn: input.issuedOn,
      signerId: input.signerId ?? null,
      voidedAt: null,
      voidReason: null,
    };
    this.vouchers.push(voucher);
    return voucher;
  }

  /** Next number a voucher type would get in a congregation (preview only). */
  nextVoucherNumber(congregationId: number, type: VoucherType): number {
    return (
      this.vouchers
        .filter((v) => v.congregationId === congregationId && v.type === type)
        .reduce((max, v) => Math.max(max, v.number), 0) + 1
    );
  }

  voidVoucher(id: number, reason: string): void {
    const voucher = this.voucher(id);
    if (voucher && voucher.voidedAt === null) {
      this.replace(this.vouchers, { ...voucher, voidedAt: this.nowIso(), voidReason: reason });
    }
  }

  /** Posts a cash line after checking the cash-book invariants (see the class comment). */
  postCashTransaction(input: CashTransactionInput, reversalOfId: number | null = null): CashTransaction {
    if (!(input.amount > 0)) {
      throw new DomainError('INVALID_AMOUNT', 'El valor del movimiento debe ser mayor que cero.');
    }
    const account = this.account(input.denominationId, input.accountId);
    if (!account || !account.isPostable || !account.isActive) {
      throw new DomainError('ACCOUNT_NOT_POSTABLE', 'La cuenta no es imputable: elige una cuenta que reciba movimientos.');
    }
    const fund = this.fund(input.denominationId, input.fundId);
    if (!fund || (!fund.isActive && reversalOfId === null)) {
      throw new DomainError('FUND_INACTIVE', 'El fondo no existe o está inactivo.');
    }
    const period = this.requireOpenPeriod(input.congregationId, input.postedOn);
    const row: CashTransaction = {
      ...input,
      id: this.nextId(this.cashTransactions),
      periodId: period.id,
      amount: roundMoney(input.amount),
      reversalOfId,
      createdAt: this.nowIso(),
    };
    this.cashTransactions.push(row);
    return row;
  }

  /**
   * Posts the reversal of a line: same account, fund and amount, opposite direction.
   * A line that consolidates several contributions is only reversed from the cash book
   * (`allowConsolidation`), which also releases its contributions; voiding one of them alone
   * would reverse the whole consolidated amount, so it is refused.
   */
  reverseCashTransaction(input: {
    transactionId: number;
    postedOn: string;
    createdById: number;
    description: string;
    /** Voucher of the reversal (CI/CE); none by default. */
    voucherId?: number | null;
    allowConsolidation?: boolean;
  }): CashTransaction {
    const original = this.cashTransactions.find((tx) => tx.id === input.transactionId);
    if (!original) {
      throw new DomainError('NOT_FOUND', 'El movimiento no existe.');
    }
    if (original.reversalOfId !== null || this.isReversed(original.id)) {
      throw new DomainError('ALREADY_REVERSED', 'El movimiento ya fue revertido o es una reversa.');
    }
    if (!input.allowConsolidation && this.isConsolidation(original.id)) {
      throw new DomainError(
        'CONTRIBUTION_CONSOLIDATED',
        'El aporte ya fue consolidado en el libro de caja: reversa primero la consolidación desde el Libro de caja.',
      );
    }
    return this.postCashTransaction(
      {
        denominationId: original.denominationId,
        congregationId: original.congregationId,
        accountId: original.accountId,
        fundId: original.fundId,
        voucherId: input.voucherId ?? null,
        direction: original.direction === 'IN' ? 'OUT' : 'IN',
        postedOn: input.postedOn,
        amount: original.amount,
        description: input.description,
        createdById: input.createdById,
      },
      original.id,
    );
  }

  /** True when a reversal of the line exists. */
  isReversed(transactionId: number): boolean {
    return this.cashTransactions.some((tx) => tx.reversalOfId === transactionId);
  }

  /**
   * True when the line consolidates contributions (they keep their own receipt, the line has
   * a CI voucher), as opposed to the line posted with the receipt of a single contribution.
   */
  isConsolidation(transactionId: number): boolean {
    const tx = this.cashTransactions.find((row) => row.id === transactionId);
    return (
      tx !== undefined &&
      this.contributions.some((c) => c.cashTransactionId === tx.id && c.voucherId !== tx.voucherId)
    );
  }

  /**
   * Applies an additional demo fixture once per store (e.g. contributions recorded without a
   * cash line yet, which the cash book consolidates). Idempotent per key.
   */
  extendOnce(key: string, apply: () => void): void {
    if (!this.extensions.has(key)) {
      this.extensions.add(key);
      apply();
    }
  }

  /** Adds, once, the contributions of today still pending consolidation (demo fixture). */
  ensurePendingContributions(): void {
    this.extendOnce('pending-contributions', () => seedPendingContributions(this, this.db.members));
  }

  // --- Vows ------------------------------------------------------------------------------------------

  /** Paid amount of a pledge: sum of its non-voided contributions. */
  vowPaid(pledgeId: number): number {
    return vowPaidAmount(this.contributions, pledgeId);
  }

  /** Recomputes ACTIVE / FULFILLED after a payment or a voided payment. */
  refreshVowPledgeStatus(pledgeId: number): VowPledge | undefined {
    const pledge = this.vowPledges.find((row) => row.id === pledgeId);
    if (!pledge) {
      return undefined;
    }
    const status = vowPledgeStatusFor(pledge, this.vowPaid(pledgeId));
    return status === pledge.status ? pledge : this.replace(this.vowPledges, { ...pledge, status });
  }

  // --- People (from the shared membership tables) -----------------------------------------------------

  /** Person of a denomination as a search option, or undefined when it belongs to another one. */
  personOption(denominationId: number, personId: number): PersonOption | undefined {
    const person = this.db.person(personId);
    if (!person || person.denominationId !== denominationId) {
      return undefined;
    }
    const member = this.db.members.find((m) => m.personId === personId);
    return {
      id: person.id,
      fullName: personFullName(person),
      memberCode: member ? this.db.memberCode(member.id) : '—',
      congregationName: member ? (this.db.congregation(member.congregationId)?.name ?? '—') : '—',
      documentHint: documentHint(person.documentTypeCode, person.documentNumber),
    };
  }

  /** Short display name ("Ana María Rojas"); never logged nor audited. */
  personName(personId: number | null): string | null {
    const person = personId === null ? undefined : this.db.person(personId);
    return person ? `${person.firstName} ${person.lastName}` : null;
  }

  /**
   * Living members of a denomination matching a name, document or member code; members of
   * `preferCongregationId` first. At least two characters are required.
   */
  searchPersons(denominationId: number, query: string, preferCongregationId: number | null): PersonOption[] {
    if (query.trim().length < 2) {
      return [];
    }
    return this.db.members
      .filter((m) => m.denominationId === denominationId && m.status !== 'DECEASED')
      .map((m) => ({ member: m, person: this.db.person(m.personId) }))
      .filter(({ member, person }) =>
        person
          ? matchesText(
              [personFullName(person), person.documentNumber, this.db.memberCode(member.id)],
              query,
            )
          : false,
      )
      .sort(
        (a, b) =>
          Number(b.member.congregationId === preferCongregationId) -
            Number(a.member.congregationId === preferCongregationId) || a.member.id - b.member.id,
      )
      .slice(0, MAX_PERSON_RESULTS)
      .map(({ person }) => this.personOption(denominationId, person!.id))
      .filter((option): option is PersonOption => option !== undefined);
  }

  /** Congregation display name. */
  congregationName(congregationId: number): string {
    return this.db.congregation(congregationId)?.name ?? '—';
  }

  /** Active congregations of a denomination (for denomination-wide aggregated views). */
  congregationIdsOf(denominationId: number): number[] {
    return this.db.congregations
      .filter((c) => c.denominationId === denominationId && c.isActive)
      .map((c) => c.id);
  }
}
