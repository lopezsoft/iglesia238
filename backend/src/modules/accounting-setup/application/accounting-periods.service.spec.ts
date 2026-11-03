import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
  contextFor,
} from '../../../../test/support/accounting-doubles.js';
import { InMemoryPeriodRepository } from '../../../../test/support/accounting-setup-fakes.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../test/support/tenants.js';
import { AccountingPeriodsService } from './accounting-periods.service.js';

function setup(today = '2026-11-02') {
  const periods = new InMemoryPeriodRepository();
  const audit = new FakeAuditRecorder();
  const service = new AccountingPeriodsService(
    periods,
    new FakeTransactionRunner(),
    audit,
    FixedClock.at(today),
  );
  return { periods, audit, service, treasurer: contextFor(TENANT_A) };
}

async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string } | null;
  return error?.code ?? 'NO_ERROR';
}

describe('AccountingPeriodsService', () => {
  it('lists the periods of the sede, newest first, with their label and range', async () => {
    const { periods, service, treasurer } = setup();
    periods.add(TENANT_A, 2026, 9, 'CLOSED');
    periods.add(TENANT_A, 2026, 10);
    periods.add(TENANT_A_SIBLING, 2026, 10);
    periods.add(TENANT_B, 2026, 10);

    const list = await service.list(treasurer);

    expect(list.map((p) => p.label)).toEqual([
      'Octubre 2026',
      'Septiembre 2026',
    ]);
    // Neither the sibling sede nor another denomination leaks into the list.
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({
      from: '2026-10-01',
      to: '2026-10-31',
      status: 'OPEN',
    });
  });

  it('answers an empty list to a denomination-wide session', async () => {
    const { periods, service } = setup();
    periods.add(TENANT_A, 2026, 10);

    expect(await service.list(contextFor(TENANT_A_WIDE))).toEqual([]);
  });

  it('opens the first period of a new sede in any month of the current year and audits it', async () => {
    const { audit, service, treasurer } = setup();

    const period = await service.open(treasurer, { year: 2026, month: 3 });

    expect(period).toMatchObject({
      year: 2026,
      month: 3,
      status: 'OPEN',
      label: 'Marzo 2026',
    });
    expect(audit.last).toMatchObject({
      action: 'PERIOD_OPENED',
      entity: 'AccountingPeriod',
    });
  });

  it('only opens the month right before the first or right after the last period', async () => {
    const { periods, service, treasurer } = setup();
    periods.add(TENANT_A, 2026, 5, 'CLOSED');
    periods.add(TENANT_A, 2026, 6);

    expect(
      await codeOf(service.open(treasurer, { year: 2026, month: 9 })),
    ).toBe('PERIOD_NOT_ADJACENT');
    await expect(
      service.open(treasurer, { year: 2026, month: 7 }),
    ).resolves.toMatchObject({
      month: 7,
    });
    await expect(
      service.open(treasurer, { year: 2026, month: 4 }),
    ).resolves.toMatchObject({
      month: 4,
    });
  });

  it('refuses a period that already exists, a future month and another year', async () => {
    const { periods, service, treasurer } = setup();
    periods.add(TENANT_A, 2026, 10);

    expect(
      await codeOf(service.open(treasurer, { year: 2026, month: 10 })),
    ).toBe('PERIOD_EXISTS');
    expect(
      await codeOf(service.open(treasurer, { year: 2026, month: 12 })),
    ).toBe('PERIOD_IN_FUTURE');
    expect(
      await codeOf(service.open(treasurer, { year: 2025, month: 12 })),
    ).toBe('PERIOD_YEAR_NOT_ALLOWED');
    expect(
      await codeOf(service.open(treasurer, { year: 2026, month: 13 })),
    ).toBe('INVALID_PERIOD');
  });

  it('needs a sede to open a period', async () => {
    const { service } = setup();

    expect(
      await codeOf(
        service.open(contextFor(TENANT_A_WIDE), { year: 2026, month: 1 }),
      ),
    ).toBe('CONGREGATION_SCOPE_REQUIRED');
  });

  it('keeps the periods of each sede apart', async () => {
    const { periods, service } = setup();
    periods.add(TENANT_A_SIBLING, 2026, 10);

    // The sibling has October; this sede is new, so any month is allowed.
    await expect(
      service.open(contextFor(TENANT_A), { year: 2026, month: 2 }),
    ).resolves.toMatchObject({ month: 2 });
  });
});
