import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { ContributionsRepository } from '../../contributions/data/contributions.repository';
import { RecordContributionCommand } from '../../contributions/data/contributions.models';
import { DemoContributionsRepository } from '../../contributions/data/demo-contributions.repository';
import { DEMO_CONTRIBUTION_TYPES, DEMO_FUNDS } from '../../data/accounting-demo-seed';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { RecordCashTransactionCommand } from './cash-book.models';
import { CashBookRepository } from './cash-book.repository';
import { DemoCashBookRepository } from './demo-cash-book.repository';

const TREASURER = 'jorge.ramirez@montedesion.example';
const PASTOR = 'daniel.herrera@montedesion.example';
const SOACHA_TREASURER = 'paola.ruiz@montedesion.example';
const TODAY = '2026-11-02';
/** Period ids of Sede Central in the seed (months 1..11 of 2026). */
const OCTOBER = 10;
const NOVEMBER = 11;

async function setup(email: string, congregationId?: number) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: CashBookRepository, useClass: DemoCashBookRepository },
      { provide: ContributionsRepository, useClass: DemoContributionsRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  const user = await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  if (congregationId !== undefined) {
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === congregationId)!);
  }
  return {
    repo: TestBed.inject(CashBookRepository),
    contributions: TestBed.inject(ContributionsRepository),
    store: TestBed.inject(AccountingDemoStore),
    db: TestBed.inject(DemoDatabase),
  };
}

async function errorOf(source: Observable<unknown>): Promise<DomainError> {
  const error = await firstValueFrom(source).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

function accountId(store: AccountingDemoStore, code: string): number {
  return store.accounts.find((a) => a.denominationId === 1 && a.code === code)!.id;
}

function expense(store: AccountingDemoStore, overrides: Partial<RecordCashTransactionCommand> = {}): RecordCashTransactionCommand {
  return {
    fundId: DEMO_FUNDS.local,
    direction: 'OUT',
    accountId: accountId(store, '510505'),
    postedOn: TODAY,
    amount: 398_700,
    description: 'Pago servicio de energía de octubre',
    ...overrides,
  };
}

/** A date of October, a month already ended (closed in the seed of Sede Central). */
const LATE_DATE = '2026-10-20';

/** Reopens October of Sede Central, as if it had not been closed yet. */
function reopenOctober(store: AccountingDemoStore): void {
  const october = store.accountingPeriods.find((p) => p.id === OCTOBER)!;
  store.replace(store.accountingPeriods, { ...october, status: 'OPEN', closedAt: null });
}

/** An anonymous offering of October, pending consolidation once recorded. */
function lateOffering(): RecordContributionCommand {
  return {
    contributionTypeId: DEMO_CONTRIBUTION_TYPES.offering,
    personId: null,
    receivedOn: LATE_DATE,
    amount: 150_000,
    paymentMethod: 'CASH',
    paymentReference: null,
    vowPledgeId: null,
    notes: 'Colecta del culto dominical',
  };
}

describe('DemoCashBookRepository', () => {
  it('computes opening (opening balance + prior periods), totals and the running balance', async () => {
    const { repo, store } = await setup(TREASURER);
    const view = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }));

    const prior = store.cashTransactions
      .filter((tx) => tx.congregationId === 1 && tx.fundId === DEMO_FUNDS.local && tx.postedOn < '2026-11-01')
      .reduce((sum, tx) => sum + (tx.direction === 'IN' ? tx.amount : -tx.amount), 0);
    expect(view.opening).toBeCloseTo(18_450_000 + prior, 2);
    expect(view.closing).toBeCloseTo(view.opening + view.income - view.expense, 2);
    expect(view.rows.at(-1)!.balance).toBeCloseTo(view.closing, 2);
    expect(view.inCount + view.outCount).toBe(view.rows.length);
    expect(view.period.status).toBe('OPEN');
    expect(view.pendingToday).toEqual({ date: TODAY, count: 6, amount: 1_240_000 });
  });

  it('records a movement with a consecutive CE voucher in the open period and audits it', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const before = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }));

    const receipt = await firstValueFrom(repo.record(expense(store)));
    expect(receipt.voucherCode).toBe(before.nextCashOut);
    const after = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }));
    expect(after.expense).toBeCloseTo(before.expense + 398_700, 2);
    expect(after.closing).toBeCloseTo(before.closing - 398_700, 2);
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'CASH_TRANSACTION_POSTED', entity: 'CashTransaction' });
    expect(store.cashTransactions.find((tx) => tx.id === receipt.transactionId)?.periodId).toBe(NOVEMBER);
  });

  it('validates direction nature, postable accounts, amount and the open period', async () => {
    const { repo, store } = await setup(TREASURER);
    const group = store.accounts.find((a) => a.denominationId === 1 && a.code === '5105')!;

    expect((await errorOf(repo.record(expense(store, { direction: 'IN' })))).code).toBe('ACCOUNT_NATURE_MISMATCH');
    expect((await errorOf(repo.record(expense(store, { accountId: group.id })))).code).toBe('ACCOUNT_NOT_POSTABLE');
    expect((await errorOf(repo.record(expense(store, { amount: 0 })))).code).toBe('INVALID_AMOUNT');
    expect((await errorOf(repo.record(expense(store, { postedOn: '2026-10-20' })))).code).toBe('PERIOD_CLOSED');
    expect((await errorOf(repo.record(expense(store, { fundId: DEMO_FUNDS.camp2025 })))).code).toBe('FUND_INACTIVE');
    expect((await errorOf(repo.record(expense(store, { description: ' ' })))).code).toBe('DESCRIPTION_REQUIRED');
  });

  it('reverses a line once: same account, fund and amount, opposite direction, linked to the original', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const original = store.cashTransactions.find((tx) => tx.congregationId === 1 && tx.description.startsWith('Papelería'))!;

    expect((await errorOf(repo.reverse({ transactionId: original.id, postedOn: TODAY, reason: 'corto' }))).code).toBe(
      'REVERSAL_REASON_REQUIRED',
    );
    expect(
      (await errorOf(repo.reverse({ transactionId: original.id, postedOn: '2026-10-30', reason: 'Factura registrada dos veces' }))).code,
    ).toBe('PERIOD_CLOSED');

    const receipt = await firstValueFrom(
      repo.reverse({ transactionId: original.id, postedOn: TODAY, reason: 'Factura registrada dos veces' }),
    );
    const reversal = store.cashTransactions.find((tx) => tx.id === receipt.transactionId)!;
    expect(reversal).toMatchObject({
      accountId: original.accountId,
      fundId: original.fundId,
      amount: original.amount,
      direction: 'IN',
      reversalOfId: original.id,
    });
    expect(receipt.voucherCode.startsWith('CI-2026-')).toBe(true);
    expect(db.auditLogs.at(-1)?.action).toBe('CASH_TRANSACTION_REVERSED');

    const reason = 'Segundo intento de reversa';
    expect((await errorOf(repo.reverse({ transactionId: original.id, postedOn: TODAY, reason }))).code).toBe('ALREADY_REVERSED');
    expect((await errorOf(repo.reverse({ transactionId: reversal.id, postedOn: TODAY, reason }))).code).toBe('ALREADY_REVERSED');

    const view = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }));
    expect(view.rows.find((r) => r.id === original.id)).toMatchObject({ status: 'REVERSED', reversalBlock: 'ALREADY_REVERSED' });
    expect(view.rows.find((r) => r.id === reversal.id)).toMatchObject({ status: 'REVERSAL', reversalBlock: 'IS_REVERSAL' });
  });

  it('allows reversing a line of a closed period with a date in an open period', async () => {
    const { repo, store } = await setup(TREASURER);
    const october = store.cashTransactions.find(
      (tx) => tx.periodId === OCTOBER && tx.description.startsWith('Honorarios del contador'),
    )!;
    const receipt = await firstValueFrom(
      repo.reverse({ transactionId: october.id, postedOn: TODAY, reason: 'Honorarios pagados por otra cuenta' }),
    );
    expect(store.cashTransactions.find((tx) => tx.id === receipt.transactionId)?.periodId).toBe(NOVEMBER);
  });

  it('sends contribution and tithe settlement lines to their own screens', async () => {
    const { repo, store } = await setup(TREASURER);
    const contributionLine = store.contributions.find((c) => c.congregationId === 1 && c.cashTransactionId !== null)!;
    const settlementVoucher = store.vouchers.find((v) => v.type === 'LD')!;
    const settlementLine = store.cashTransactions.find((tx) => tx.voucherId === settlementVoucher.id)!;
    const reason = 'Intento de reversa desde la caja';

    expect((await errorOf(repo.reverse({ transactionId: contributionLine.cashTransactionId!, postedOn: TODAY, reason }))).code).toBe(
      'CONTRIBUTION_LINE',
    );
    expect((await errorOf(repo.reverse({ transactionId: settlementLine.id, postedOn: TODAY, reason }))).code).toBe('SETTLEMENT_LINE');
  });

  it('consolidates the pending contributions of a date into one inflow per account and links them', async () => {
    const { repo, store, contributions } = await setup(TREASURER);
    const preview = await firstValueFrom(repo.consolidationPreview(TODAY));

    expect(preview.count).toBe(8);
    expect(preview.total).toBe(1_420_000);
    expect(preview.groups.map((g) => [g.accountCode, g.fundId, g.count, g.amount])).toEqual([
      ['410505', DEMO_FUNDS.local, 3, 640_000],
      ['410510', DEMO_FUNDS.local, 2, 480_000],
      ['410515', DEMO_FUNDS.local, 1, 120_000],
      ['410525', DEMO_FUNDS.missions, 2, 180_000],
    ]);

    const result = await firstValueFrom(repo.consolidate(TODAY));
    expect(result).toMatchObject({ movements: 4, count: 8, total: 1_420_000, voucherCode: preview.nextVoucherCode });
    const linked = store.contributions.filter((c) => c.congregationId === 1 && c.receivedOn === TODAY && c.status === 'RECORDED');
    expect(linked.every((c) => c.cashTransactionId !== null)).toBe(true);
    const tithes = store.cashTransactions.find((tx) => tx.id === linked.find((c) => c.amount === 90_000)!.cashTransactionId)!;
    expect(tithes).toMatchObject({ direction: 'IN', amount: 640_000, fundId: DEMO_FUNDS.local });
    expect((await errorOf(repo.consolidate(TODAY))).code).toBe('NOTHING_TO_CONSOLIDATE');
    // Sede Norte keeps its own pending contribution.
    expect(store.contributions.some((c) => c.congregationId === 2 && c.cashTransactionId === null)).toBe(true);

    // Voiding a consolidated contribution alone is refused; reversing the consolidation releases them.
    const consolidated = linked.find((c) => c.amount === 90_000)!;
    expect((await errorOf(contributions.void(consolidated.id, 'Aporte digitado con error en el sobre'))).code).toBe(
      'CONTRIBUTION_CONSOLIDATED',
    );
    await firstValueFrom(repo.reverse({ transactionId: tithes.id, postedOn: TODAY, reason: 'Consolidación con un sobre de más' }));
    const released = store.contributions.filter((c) => c.cashTransactionId === tithes.id);
    expect(released).toHaveLength(0);
    const again = await firstValueFrom(repo.consolidationPreview(TODAY));
    expect(again).toMatchObject({ count: 3, total: 640_000 });
  });

  it('refuses consolidation of a closed period or a future date', async () => {
    const { repo } = await setup(TREASURER);
    expect((await errorOf(repo.consolidate('2026-10-25'))).code).toBe('PERIOD_CLOSED');
    expect((await errorOf(repo.consolidate('2026-11-05'))).code).toBe('FUTURE_DATE');
  });

  it('closes only months already ended, in order and without pending contributions, then rejects movements', async () => {
    const { repo, store, db, contributions } = await setup(TREASURER);

    // November is the month in progress: it cannot be closed yet.
    expect((await errorOf(repo.closePeriod(NOVEMBER))).code).toBe('PERIOD_NOT_ENDED');
    const current = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }));
    expect(current.closeBlockedReason).toContain('aún no termina');

    reopenOctober(store);
    expect((await errorOf(repo.closePeriod(NOVEMBER))).code).toBe('PREVIOUS_PERIOD_OPEN');
    await firstValueFrom(contributions.record(lateOffering()));
    expect((await errorOf(repo.closePeriod(OCTOBER))).code).toBe('PENDING_CONSOLIDATION');
    await firstValueFrom(repo.consolidate(LATE_DATE));

    const closed = await firstValueFrom(repo.closePeriod(OCTOBER));
    expect(closed.status).toBe('CLOSED');
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'PERIOD_CLOSED', entity: 'AccountingPeriod' });
    expect((await errorOf(repo.closePeriod(OCTOBER))).code).toBe('PERIOD_ALREADY_CLOSED');
    expect((await errorOf(repo.record(expense(store, { postedOn: LATE_DATE })))).code).toBe('PERIOD_CLOSED');

    const octoberView = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: OCTOBER }));
    const novemberView = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }));
    expect(novemberView.opening).toBeCloseTo(octoberView.closing, 2);
  });

  it('refuses to reverse a consolidation whose contributions belong to a closed period', async () => {
    const { repo, store, contributions } = await setup(TREASURER);
    reopenOctober(store);
    const late = await firstValueFrom(contributions.record(lateOffering()));
    await firstValueFrom(repo.consolidate(LATE_DATE));
    const lineId = store.contributions.find((c) => c.id === late.id)!.cashTransactionId!;

    // While October is open the consolidation can still be reversed.
    let view = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: OCTOBER }));
    expect(view.rows.find((r) => r.id === lineId)?.reversalBlock).toBeNull();

    await firstValueFrom(repo.closePeriod(OCTOBER));
    view = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: OCTOBER }));
    expect(view.rows.find((r) => r.id === lineId)?.reversalBlock).toBe('CONSOLIDATION_PERIOD_CLOSED');
    const reason = 'Consolidación con un sobre de más';
    expect((await errorOf(repo.reverse({ transactionId: lineId, postedOn: TODAY, reason }))).code).toBe(
      'CONSOLIDATION_PERIOD_CLOSED',
    );
    expect(store.isReversed(lineId)).toBe(false);
    expect(store.contributions.find((c) => c.id === late.id)?.cashTransactionId).toBe(lineId);
  });

  it('never dates movements nor reversals after today', async () => {
    const { repo, store } = await setup(TREASURER);
    const view = await firstValueFrom(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }));
    expect(view.openRange).toEqual({ min: '2026-11-01', max: TODAY });

    const before = store.cashTransactions.length;
    expect((await errorOf(repo.record(expense(store, { postedOn: '2026-11-30' })))).code).toBe('FUTURE_DATE');
    const original = store.cashTransactions.find((tx) => tx.congregationId === 1 && tx.description.startsWith('Papelería'))!;
    expect(
      (await errorOf(repo.reverse({ transactionId: original.id, postedOn: '2026-11-30', reason: 'Factura registrada dos veces' }))).code,
    ).toBe('FUTURE_DATE');
    expect(store.cashTransactions.length).toBe(before);
  });

  it('requires cash-transactions.write', async () => {
    const { repo, store } = await setup(PASTOR);
    expect((await errorOf(repo.options())).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }))).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.record(expense(store)))).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.closePeriod(NOVEMBER))).code).toBe('FORBIDDEN');
  });

  it('isolates sedes: the Soacha treasurer never reads nor changes Sede Central', async () => {
    const { repo, store } = await setup(SOACHA_TREASURER, 3);
    const options = await firstValueFrom(repo.options());
    expect(options.congregationName).toBe('Sede Soacha');
    expect(options.periods.every((p) => !store.accountingPeriods.find((row) => row.id === p.id && row.congregationId !== 3))).toBe(true);

    const central = store.cashTransactions.find((tx) => tx.congregationId === 1 && tx.description.startsWith('Papelería'))!;
    expect((await errorOf(repo.view({ fundId: DEMO_FUNDS.local, periodId: NOVEMBER }))).code).toBe('NOT_FOUND');
    expect((await errorOf(repo.reverse({ transactionId: central.id, postedOn: TODAY, reason: 'Intento desde otra sede' }))).code).toBe(
      'NOT_FOUND',
    );
    expect((await errorOf(repo.closePeriod(NOVEMBER))).code).toBe('NOT_FOUND');
    expect((await firstValueFrom(repo.consolidationPreview(TODAY))).count).toBe(0);
  });
});
