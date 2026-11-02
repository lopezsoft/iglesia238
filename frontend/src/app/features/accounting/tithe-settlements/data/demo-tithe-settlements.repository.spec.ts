import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { contributionDisplayStatus } from '../../data/accounting-rules';
import { allocateTithe } from './tithe-allocation';
import { DemoTitheSettlementsRepository } from './demo-tithe-settlements.repository';
import { TitheSettlementsRepository } from './tithe-settlements.repository';

const TREASURER = 'jorge.ramirez@montedesion.example';
const PASTOR = 'daniel.herrera@montedesion.example';
const SOACHA_TREASURER = 'paola.ruiz@montedesion.example';
const OCTOBER = { from: '2026-10-01', to: '2026-10-31' };
/** Valid October tithes of Sede Central in the seed (one duplicate is voided). */
const OCTOBER_GROSS = 3_230_000;

async function setup(email: string, congregationId?: number) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: TitheSettlementsRepository, useClass: DemoTitheSettlementsRepository },
    ],
  });
  const auth = TestBed.inject(AuthService);
  const user = await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  if (congregationId !== undefined) {
    auth.selectScope(user.selectableScopes.find((scope) => scope.congregationId === congregationId)!);
  }
  return {
    repo: TestBed.inject(TitheSettlementsRepository),
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

describe('allocateTithe', () => {
  it('applies the rule formula and sums exactly the gross', () => {
    expect(allocateTithe(OCTOBER_GROSS, { nationalShareRate: 0.1, localFundRate: 0.3 })).toEqual({
      nationalShare: 323_000,
      localFundShare: 872_100,
      pastorNet: 2_034_900,
    });
  });

  it('assigns the rounding remainder to the largest component', () => {
    // 2,5 → 3 · 6,75 → 7 · 15,75 → 16 adds 26: the extra peso comes off the pastoral share.
    expect(allocateTithe(25, { nationalShareRate: 0.1, localFundRate: 0.3 })).toEqual({
      nationalShare: 3,
      localFundShare: 7,
      pastorNet: 15,
    });
    const cents = allocateTithe(1_000.5, { nationalShareRate: 0.1, localFundRate: 0.3 });
    expect(cents).toEqual({ nationalShare: 100, localFundShare: 270, pastorNet: 630.5 });
    for (const gross of [1, 7, 333, 1_234_567, 98_765.43]) {
      const { nationalShare, localFundShare, pastorNet } = allocateTithe(gross, { nationalShareRate: 0.21, localFundRate: 0.03 });
      expect(Math.round((nationalShare + localFundShare + pastorNet) * 100)).toBe(Math.round(gross * 100));
    }
  });
});

describe('DemoTitheSettlementsRepository', () => {
  it('previews the recorded, not settled tithes of the range with the current rule', async () => {
    const { repo } = await setup(TREASURER);
    const preview = await firstValueFrom(repo.preview(OCTOBER));

    expect(preview.count).toBe(9);
    expect(preview.excludedCount).toBe(1);
    expect(preview.grossTithe).toBe(OCTOBER_GROSS);
    expect(preview.rule).toMatchObject({ nationalShareRate: 0.1, localFundRate: 0.3 });
    expect(preview.components.map((c) => [c.key, c.amount])).toEqual([
      ['NATIONAL', 323_000],
      ['LOCAL_FUND', 872_100],
      ['PASTOR', 2_034_900],
    ]);
    expect(preview.componentsTotal).toBe(preview.grossTithe);
    expect(preview.contributions.reduce((sum, c) => sum + c.amount, 0)).toBe(OCTOBER_GROSS);
    expect(preview.nextNumber).toBe('LD-2026-00002');
  });

  it('includes tithes still pending consolidation and returns an empty draft for an empty range', async () => {
    const { repo, store } = await setup(TREASURER);
    const november = await firstValueFrom(repo.preview({ from: '2026-11-01', to: '2026-11-02' }));
    const pending = store.contributions.filter(
      (c) => c.congregationId === 1 && c.cashTransactionId === null && c.contributionTypeId === 1,
    );
    expect(pending.length).toBe(3);
    expect(pending.every((c) => november.contributions.some((row) => row.id === c.id))).toBe(true);

    const empty = await firstValueFrom(repo.preview({ from: '2026-06-01', to: '2026-06-30' }));
    expect(empty).toMatchObject({ count: 0, grossTithe: 0, componentsTotal: 0 });
    expect((await errorOf(repo.confirm({ from: '2026-06-01', to: '2026-06-30' }))).code).toBe('NO_TITHES');
  });

  it('rejects invalid, future and overlapping ranges', async () => {
    const { repo } = await setup(TREASURER);
    expect((await errorOf(repo.preview({ from: '2026-10-31', to: '2026-10-01' }))).code).toBe('INVALID_RANGE');
    expect((await errorOf(repo.preview({ from: '2026-11-01', to: '2026-11-30' }))).code).toBe('FUTURE_RANGE');
    expect((await errorOf(repo.preview({ from: '2026-09-15', to: '2026-10-15' }))).code).toBe('OVERLAPPING_SETTLEMENT');
    expect((await errorOf(repo.confirm({ from: '2026-09-30', to: '2026-10-31' }))).code).toBe('OVERLAPPING_SETTLEMENT');
  });

  it('confirms: copies the rule, settles the tithes, books the payables and audits', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const row = await firstValueFrom(repo.confirm(OCTOBER));

    expect(row).toMatchObject({ status: 'ISSUED', grossTithe: OCTOBER_GROSS, contributionCount: 9, number: 'LD-2026-00002' });
    expect(row.nationalShare + row.localFundShare + row.pastorNet).toBe(OCTOBER_GROSS);
    const settled = store.contributions.filter((c) => c.titheSettlementId === row.id);
    expect(settled).toHaveLength(9);
    expect(settled.every((c) => contributionDisplayStatus(c) === 'SETTLED')).toBe(true);

    const settlement = store.titheSettlements.find((s) => s.id === row.id)!;
    const lines = store.cashTransactions.filter((tx) => tx.voucherId === settlement.voucherId);
    expect(lines.map((tx) => [tx.direction, tx.amount])).toEqual([
      ['OUT', 323_000],
      ['OUT', 2_034_900],
    ]);
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'TITHE_SETTLED', entity: 'TitheSettlement' });

    // A later rule never changes an issued settlement.
    const rule = store.titheSettlementRules.find((r) => r.id === 2)!;
    store.replace(store.titheSettlementRules, { ...rule, nationalShareRate: 0.2 });
    expect(store.titheSettlements.find((s) => s.id === row.id)).toMatchObject({ nationalShareRate: 0.1, nationalShare: 323_000 });

    expect((await errorOf(repo.confirm(OCTOBER))).code).toBe('OVERLAPPING_SETTLEMENT');
  });

  it('confirms atomically: an inactive payable fund leaves no settlement, voucher, link nor cash line', async () => {
    const { repo, store } = await setup(TREASURER);
    const local = store.funds.find((f) => f.id === 1)!;
    store.replace(store.funds, { ...local, isActive: false });
    const counts = () => [store.titheSettlements.length, store.vouchers.length, store.cashTransactions.length];
    const before = counts();

    expect((await errorOf(repo.confirm(OCTOBER))).code).toBe('FUND_INACTIVE');
    expect(counts()).toEqual(before);
    expect(
      store.contributions.some(
        (c) => c.congregationId === 1 && c.receivedOn >= OCTOBER.from && c.receivedOn <= OCTOBER.to && c.titheSettlementId !== null,
      ),
    ).toBe(false);

    // Once the fund is active again the same range settles normally.
    store.replace(store.funds, local);
    const row = await firstValueFrom(repo.confirm(OCTOBER));
    expect(row).toMatchObject({ status: 'ISSUED', contributionCount: 9 });
  });

  it('voids with a reason, releases the tithes and reverses the payables', async () => {
    const { repo, store, db } = await setup(TREASURER);
    const september = store.titheSettlements[0];
    const settledIds = store.contributions.filter((c) => c.titheSettlementId === september.id).map((c) => c.id);

    expect((await errorOf(repo.void(september.id, 'corto'))).code).toBe('VOID_REASON_REQUIRED');
    const row = await firstValueFrom(repo.void(september.id, 'Se omitieron transferencias del último día del rango'));

    expect(row.status).toBe('VOIDED');
    expect(row.voidReason).toContain('transferencias');
    for (const id of settledIds) {
      const contribution = store.contributions.find((c) => c.id === id)!;
      expect(contribution.titheSettlementId).toBeNull();
      expect(contributionDisplayStatus(contribution)).toBe('RECORDED');
    }
    const lines = store.cashTransactions.filter((tx) => tx.voucherId === september.voucherId);
    expect(lines.every((tx) => store.isReversed(tx.id))).toBe(true);
    expect(db.auditLogs.at(-1)).toMatchObject({ action: 'TITHE_SETTLEMENT_VOIDED', entity: 'TitheSettlement' });
    expect((await errorOf(repo.void(september.id, 'Segundo intento de anulación'))).code).toBe('ALREADY_VOIDED');

    // The released range can be settled again.
    const again = await firstValueFrom(repo.preview({ from: september.coveredFrom, to: september.coveredTo }));
    expect(again.count).toBe(settledIds.length);
    expect(again.grossTithe).toBe(september.grossTithe);
  });

  it('requires tithe-settlements.write', async () => {
    const { repo } = await setup(PASTOR);
    expect((await errorOf(repo.overview())).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.preview(OCTOBER))).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.confirm(OCTOBER))).code).toBe('FORBIDDEN');
    expect((await errorOf(repo.void(1, 'Intento sin permiso suficiente'))).code).toBe('FORBIDDEN');
  });

  it('isolates sedes: the Soacha treasurer only settles Soacha tithes', async () => {
    const { repo } = await setup(SOACHA_TREASURER, 3);
    const overview = await firstValueFrom(repo.overview());
    expect(overview.congregationName).toBe('Sede Soacha');
    expect(overview.settlements).toEqual([]);
    // September of Sede Central is settled, but it does not block Soacha.
    const preview = await firstValueFrom(repo.preview({ from: '2026-09-01', to: '2026-11-02' }));
    expect(preview).toMatchObject({ count: 1, grossTithe: 260_000, congregationName: 'Sede Soacha' });
    expect((await errorOf(repo.void(1, 'Intento desde otra sede distinta'))).code).toBe('NOT_FOUND');
  });
});
