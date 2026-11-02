import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { DEMO_CONTRIBUTION_TYPES } from '../../data/accounting-demo-seed';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { DemoTitheSettlementsRepository } from '../../tithe-settlements/data/demo-tithe-settlements.repository';
import { TitheSettlementsRepository } from '../../tithe-settlements/data/tithe-settlements.repository';
import { RecordContributionCommand } from './contributions.models';
import { ContributionsRepository } from './contributions.repository';
import { DemoContributionsRepository } from './demo-contributions.repository';

const TREASURER = 'jorge.ramirez@montedesion.example';
const PASTOR = 'daniel.herrera@montedesion.example';
const SOACHA_TREASURER = 'paola.ruiz@montedesion.example';
const DENOMINATION_ADMIN = 'andres.molina@montedesion.example';

async function setup(email: string, congregationId?: number) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: ContributionsRepository, useClass: DemoContributionsRepository },
      { provide: TitheSettlementsRepository, useClass: DemoTitheSettlementsRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  const user = await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  if (congregationId !== undefined) {
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === congregationId)!);
  }
  return {
    repo: TestBed.inject(ContributionsRepository),
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

/** A valid November tithe of a Sede Central member. */
function tithe(store: AccountingDemoStore, overrides: Partial<RecordContributionCommand> = {}): RecordContributionCommand {
  const personId = store.contributions.find((c) => c.congregationId === 1 && c.personId !== null)!.personId;
  return {
    contributionTypeId: DEMO_CONTRIBUTION_TYPES.tithe,
    personId,
    receivedOn: '2026-11-02',
    amount: 250_000,
    paymentMethod: 'CASH',
    paymentReference: null,
    vowPledgeId: null,
    notes: null,
    ...overrides,
  };
}

describe('DemoContributionsRepository', () => {
  it('lists the month of the sede with per-category totals that exclude voided contributions', async () => {
    const { repo } = await setup(TREASURER);
    const october = await firstValueFrom(repo.listMonth({ year: 2026, month: 10 }));

    expect(october.periodStatus).toBe('CLOSED');
    expect(october.rows.every((r) => r.congregationName === 'Sede Central')).toBe(true);
    expect(october.voidedCount).toBe(1);
    const valid = october.rows.filter((r) => r.status !== 'VOIDED').reduce((sum, r) => sum + r.amount, 0);
    expect(october.total).toBe(valid);
    expect(october.summary.reduce((sum, s) => sum + s.amount, 0)).toBe(valid);
    expect(october.rows[0].receiptNumber > october.rows.at(-1)!.receiptNumber).toBe(true);
  });

  it('records a contribution with its receipt, pending consolidation, and an audit entry without names', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const options = await firstValueFrom(repo.formOptions());
    const before = store.cashTransactions.length;

    const row = await firstValueFrom(repo.record(tithe(store)));

    expect(row.receiptNumber).toBe(options.nextReceiptNumber);
    expect(row.status).toBe('RECORDED');
    expect(store.cashTransactions.length).toBe(before);
    expect(store.contributions.at(-1)?.cashTransactionId).toBeNull();
    const audit = db.auditLogs.at(-1)!;
    expect(audit.action).toBe('CONTRIBUTION_RECORDED');
    expect(audit.changes?.['amount']?.to).toBe(250_000);
    expect(JSON.stringify(audit.changes)).not.toContain(row.contributorName!);
  });

  it('rejects dates in a closed period or in the future, and missing references', async () => {
    const { repo, store } = await setup(TREASURER);
    expect((await errorOf(repo.record(tithe(store, { receivedOn: '2026-10-25' })))).code).toBe('PERIOD_CLOSED');
    expect((await errorOf(repo.record(tithe(store, { receivedOn: '2026-11-20' })))).code).toBe('FUTURE_DATE');
    expect((await errorOf(repo.record(tithe(store, { amount: 0 })))).code).toBe('INVALID_AMOUNT');
    expect((await errorOf(repo.record(tithe(store, { paymentMethod: 'BANK_TRANSFER' })))).code).toBe('REFERENCE_REQUIRED');
    expect((await errorOf(repo.record(tithe(store, { contributionTypeId: DEMO_CONTRIBUTION_TYPES.templeOffering2025 })))).code).toBe('TYPE_INACTIVE');
  });

  it('lets the pastor read but not record nor void', async () => {
    const { repo, store } = await setup(PASTOR);
    const month = await firstValueFrom(repo.listMonth({ year: 2026, month: 11 }));
    expect(month.rows.length).toBeGreaterThan(0);

    expect((await errorOf(repo.record(tithe(store)))).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.void(month.rows[0].id, 'Prueba de anulación sin permiso'))).code).toBe('FORBIDDEN');
  });

  it('denies contributions to roles without contributions.read', async () => {
    const { repo } = await setup(DENOMINATION_ADMIN, 1);
    expect((await errorOf(repo.listMonth({ year: 2026, month: 11 }))).code).toBe('FORBIDDEN');
  });

  it('isolates sedes: the Soacha treasurer sees and voids only Soacha contributions', async () => {
    const { repo, store } = await setup(SOACHA_TREASURER, 3);
    const month = await firstValueFrom(repo.listMonth({ year: 2026, month: 11 }));

    expect(month.rows.length).toBe(2);
    expect(month.rows.every((r) => r.congregationName === 'Sede Soacha')).toBe(true);
    const central = store.contributions.find((c) => c.congregationId === 1 && c.status === 'RECORDED' && c.titheSettlementId === null)!;
    expect((await errorOf(repo.void(central.id, 'Intento desde otra sede'))).code).toBe('NOT_FOUND');
  });

  it('voids a contribution not yet consolidated with a reason, without touching the cash book', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const recorded = await firstValueFrom(repo.record(tithe(store)));
    const before = store.cashTransactions.length;

    expect((await errorOf(repo.void(recorded.id, 'corto'))).code).toBe('VOID_REASON_REQUIRED');
    const row = await firstValueFrom(repo.void(recorded.id, 'Valor digitado con error; se registra de nuevo.'));

    expect(row.status).toBe('VOIDED');
    expect(store.cashTransactions.length).toBe(before);
    expect(db.auditLogs.at(-1)?.action).toBe('CONTRIBUTION_VOIDED');
  });

  it('voids a contribution posted with its own receipt line by reversing that line today', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const posted = store.contributions.find(
      (c) =>
        c.congregationId === 1 &&
        c.status === 'RECORDED' &&
        c.titheSettlementId === null &&
        c.cashTransactionId !== null &&
        store.cashTransactions.find((tx) => tx.id === c.cashTransactionId)?.voucherId === c.voucherId,
    )!;
    const line = store.cashTransactions.find((tx) => tx.id === posted.cashTransactionId)!;
    const month = await firstValueFrom(repo.listMonth({ year: 2026, month: Number(posted.receivedOn.slice(5, 7)) }));
    expect(month.rows.find((r) => r.id === posted.id)?.voidBlock).toBeNull();

    const row = await firstValueFrom(repo.void(posted.id, 'Valor digitado con error en el sobre'));

    expect(row.status).toBe('VOIDED');
    const reversal = store.cashTransactions.find((tx) => tx.reversalOfId === line.id)!;
    expect(reversal).toMatchObject({ direction: 'OUT', amount: line.amount, postedOn: '2026-11-02', fundId: line.fundId });
    expect(db.auditLogs.at(-1)?.action).toBe('CONTRIBUTION_VOIDED');
  });

  it('refuses to void a contribution inside a consolidation: the cash book reverses it first', async () => {
    const { repo, store } = await setup(TREASURER);
    const recorded = await firstValueFrom(repo.record(tithe(store)));
    const contribution = store.contributions.find((c) => c.id === recorded.id)!;
    // Consolidation line: a CI voucher shared by the day's contributions.
    const voucher = store.issueVoucher({ denominationId: 1, congregationId: 1, type: 'CI', issuedOn: '2026-11-02' });
    const tx = store.postCashTransaction({
      denominationId: 1,
      congregationId: 1,
      accountId: store.accounts.find((a) => a.denominationId === 1 && a.code === '410505')!.id,
      fundId: 1,
      voucherId: voucher.id,
      direction: 'IN',
      postedOn: '2026-11-02',
      amount: contribution.amount,
      description: 'Consolidación de aportes del 02/11/2026 (1 aporte)',
      createdById: 5,
    });
    store.replace(store.contributions, { ...contribution, cashTransactionId: tx.id });
    const before = store.cashTransactions.length;

    const month = await firstValueFrom(repo.listMonth({ year: 2026, month: 11 }));
    expect(month.rows.find((r) => r.id === recorded.id)?.voidBlock).toBe('CONSOLIDATED');
    expect((await errorOf(repo.void(recorded.id, 'Valor digitado con error en el sobre'))).code).toBe(
      'CONTRIBUTION_CONSOLIDATED',
    );
    expect(store.cashTransactions.length).toBe(before);
    expect(store.contributions.find((c) => c.id === recorded.id)?.status).toBe('RECORDED');
  });

  it('refuses tithes dated inside the range of an issued tithe settlement', async () => {
    const { repo, store } = await setup(TREASURER);
    const settlements = TestBed.inject(TitheSettlementsRepository);
    await firstValueFrom(settlements.confirm({ from: '2026-11-01', to: '2026-11-02' }));

    const options = await firstValueFrom(repo.formOptions());
    expect(options.settledTitheRanges).toContainEqual({ from: '2026-11-01', to: '2026-11-02' });
    expect((await errorOf(repo.record(tithe(store)))).code).toBe('TITHE_RANGE_SETTLED');
    // Other categories are not settled, so the same date is still valid for them.
    const offering = await firstValueFrom(repo.record(tithe(store, { contributionTypeId: DEMO_CONTRIBUTION_TYPES.offering })));
    expect(offering.status).toBe('RECORDED');
  });

  it('refuses to void settled or already voided contributions', async () => {
    const { repo, store } = await setup(TREASURER);
    const settled = store.contributions.find((c) => c.titheSettlementId !== null)!;

    expect((await errorOf(repo.void(settled.id, 'Intento de anular un diezmo liquidado'))).code).toBe('CONTRIBUTION_SETTLED');
    expect((await errorOf(repo.void(18, 'Intento de anular dos veces el mismo aporte'))).code).toBe('ALREADY_VOIDED');
  });

  it('accepts vow payments only for a pledge of the same person and type, within its balance', async () => {
    const { repo, store } = await setup(TREASURER);
    const pledge = store.vowPledges.find((p) => p.id === 1)!;
    const vow = (overrides: Partial<RecordContributionCommand>) =>
      tithe(store, { contributionTypeId: DEMO_CONTRIBUTION_TYPES.vow, personId: pledge.personId, vowPledgeId: pledge.id, ...overrides });

    const otherPerson = store.vowPledges.find((p) => p.id === 2)!.personId;
    expect((await errorOf(repo.record(vow({ personId: otherPerson })))).code).toBe('VOW_PLEDGE_MISMATCH');
    expect((await errorOf(repo.record(vow({ personId: null })))).code).toBe('VOW_REQUIRES_PERSON');
    expect((await errorOf(repo.record(vow({ vowPledgeId: null })))).code).toBe('VOW_PLEDGE_REQUIRED');
    expect((await errorOf(repo.record(vow({ amount: 450_001 })))).code).toBe('VOW_PAYMENT_EXCEEDS_BALANCE');
    expect((await errorOf(repo.record(tithe(store, { vowPledgeId: pledge.id })))).code).toBe('VOW_PLEDGE_NOT_ALLOWED');

    const fulfilled = store.vowPledges.find((p) => p.id === 3)!;
    expect((await errorOf(repo.record(vow({ personId: fulfilled.personId, vowPledgeId: fulfilled.id, amount: 1 })))).code).toBe('VOW_PLEDGE_CLOSED');

    await firstValueFrom(repo.record(vow({ amount: 450_000 })));
    expect(store.vowPledges.find((p) => p.id === 1)?.status).toBe('FULFILLED');
  });

  it('offers only open pledges of the person and type, and preselects one for "Registrar abono"', async () => {
    const { repo, store } = await setup(TREASURER);
    const pledge = store.vowPledges.find((p) => p.id === 1)!;

    const options = await firstValueFrom(repo.openPledges(pledge.personId, DEMO_CONTRIBUTION_TYPES.vow));
    expect(options.map((o) => o.id)).toEqual([1]);
    expect(options[0].balance).toBe(450_000);
    expect(options[0].label).toContain('VOTO-2026-0001');

    const target = await firstValueFrom(repo.vowPaymentTarget(1));
    expect(target.person.id).toBe(pledge.personId);
    expect((await errorOf(repo.vowPaymentTarget(3))).code).toBe('VOW_PLEDGE_CLOSED');
  });

  it('searches people of the denomination only', async () => {
    const { repo, db } = await setup(TREASURER);
    const results = await firstValueFrom(repo.searchPersons('Ana'));

    expect(results.length).toBeGreaterThan(0);
    expect(results.every((p) => db.person(p.id)?.denominationId === 1)).toBe(true);
    expect(results.every((p) => p.documentHint.includes('···'))).toBe(true);
  });
});
