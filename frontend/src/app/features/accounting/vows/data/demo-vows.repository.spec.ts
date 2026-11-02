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
import { ContributionsRepository } from '../../contributions/data/contributions.repository';
import { DemoContributionsRepository } from '../../contributions/data/demo-contributions.repository';
import { CreateVowPledgeCommand } from './vows.models';
import { VowsRepository } from './vows.repository';
import { DemoVowsRepository } from './demo-vows.repository';

const TREASURER = 'jorge.ramirez@montedesion.example';
const PASTOR = 'daniel.herrera@montedesion.example';
const NORTE_PASTOR = 'luis.ortega@montedesion.example';

async function setup(email: string) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: VowsRepository, useClass: DemoVowsRepository },
      { provide: ContributionsRepository, useClass: DemoContributionsRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_PASSWORD));
  return {
    repo: TestBed.inject(VowsRepository),
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

function command(store: AccountingDemoStore, overrides: Partial<CreateVowPledgeCommand> = {}): CreateVowPledgeCommand {
  return {
    personId: store.vowPledges[0].personId,
    contributionTypeId: DEMO_CONTRIBUTION_TYPES.vow,
    pledgedAmount: 500_000,
    pledgedOn: '2026-11-02',
    description: 'Ofrenda para el sonido',
    ...overrides,
  };
}

describe('DemoVowsRepository', () => {
  it('computes paid, balance, progress and status from the non-voided payments', async () => {
    const { repo } = await setup(TREASURER);
    const { rows } = await firstValueFrom(repo.overview());

    const first = rows.find((r) => r.id === 1)!;
    expect(first).toMatchObject({ pledgedAmount: 1_000_000, paid: 550_000, balance: 450_000, progress: 55, status: 'ACTIVE', paymentCount: 3 });
    expect(first.lastPaymentOn).toBe('2026-11-02');
    expect(rows.find((r) => r.id === 3)).toMatchObject({ balance: 0, progress: 100, status: 'FULFILLED' });
    expect(rows.find((r) => r.id === 4)).toMatchObject({ paid: 0, paymentCount: 0, lastPaymentOn: null });
  });

  it('shows the payments of a pledge with their receipts', async () => {
    const { repo } = await setup(TREASURER);
    const detail = await firstValueFrom(repo.detail(2));

    expect(detail.payments.length).toBe(4);
    expect(detail.payments.every((p) => p.receiptNumber.startsWith('REC-2026-'))).toBe(true);
    expect(detail.fundName).toBe('Fondo de Construcción');
    expect(detail.code).toBe('VOTO-2026-0002');
  });

  it('reopens a fulfilled pledge when one of its payments is voided', async () => {
    const { repo, contributions, store } = await setup(TREASURER);
    const consolidated = store.contributions.find((c) => c.vowPledgeId === 3 && c.receivedOn === '2026-10-25')!;
    // As if the cash book had reversed its consolidation: only then can the payment be voided.
    const payment = store.replace(store.contributions, { ...consolidated, cashTransactionId: null });
    await firstValueFrom(contributions.void(payment.id, 'Abono registrado en la promesa equivocada'));

    const row = (await firstValueFrom(repo.overview())).rows.find((r) => r.id === 3)!;
    expect(row).toMatchObject({ paid: 300_000, balance: 300_000, status: 'ACTIVE' });
  });

  it('creates a pledge and audits it without personal data', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const row = await firstValueFrom(repo.create(command(store)));

    expect(row).toMatchObject({ status: 'ACTIVE', paid: 0, balance: 500_000, congregationName: 'Sede Central' });
    const audit = db.auditLogs.at(-1)!;
    expect(audit.action).toBe('VOW_PLEDGE_CREATED');
    expect(JSON.stringify(audit.changes)).not.toContain(row.personName);
  });

  it('validates the amount, the date, the person and the type of a new pledge', async () => {
    const { repo, store } = await setup(TREASURER);
    expect((await errorOf(repo.create(command(store, { pledgedAmount: 0 })))).code).toBe('INVALID_AMOUNT');
    expect((await errorOf(repo.create(command(store, { pledgedOn: '2026-12-01' })))).code).toBe('FUTURE_DATE');
    expect((await errorOf(repo.create(command(store, { personId: 50 })))).code).toBe('PERSON_NOT_FOUND');
    expect((await errorOf(repo.create(command(store, { contributionTypeId: DEMO_CONTRIBUTION_TYPES.tithe })))).code).toBe('VOW_TYPE_INVALID');
  });

  it('lets the pastor read pledges but not create them', async () => {
    const { repo, store } = await setup(PASTOR);
    const overview = await firstValueFrom(repo.overview());
    expect(overview.rows.length).toBe(4);
    expect((await errorOf(repo.create(command(store)))).code).toBe('FORBIDDEN');
  });

  it('isolates the pledges of another sede', async () => {
    const { repo } = await setup(NORTE_PASTOR);
    const { rows } = await firstValueFrom(repo.overview());

    expect(rows.map((r) => r.id)).toEqual([5]);
    expect((await errorOf(repo.detail(1))).code).toBe('NOT_FOUND');
  });
});
