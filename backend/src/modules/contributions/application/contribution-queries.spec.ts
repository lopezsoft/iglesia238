import { describe, expect, it } from 'vitest';
import { CSV_BOM } from '../../../common/export/csv-document.js';
import { describeCrossTenantIsolation } from '../../../../test/support/cross-tenant.js';
import {
  TENANT_A,
  TENANT_A_SIBLING,
  TENANT_A_WIDE,
  TENANT_B,
} from '../../../../test/support/tenants.js';
import {
  PERSON,
  TODAY,
  TYPE,
  actingIn,
  buildKit,
} from '../testing/world-fixtures.js';
import { ExportContributionsUseCase } from './export-contributions.use-case.js';
import { GetContributionFormOptionsUseCase } from './get-contribution-form-options.use-case.js';
import { GetContributionUseCase } from './get-contribution.use-case.js';
import { ListContributionsUseCase } from './list-contributions.use-case.js';
import { RecordContributionUseCase } from './record-contribution.use-case.js';
import { SearchContributorsUseCase } from './search-contributors.use-case.js';
import { VoidContributionUseCase } from './void-contribution.use-case.js';

function setup() {
  const kit = buildKit();
  const record = new RecordContributionUseCase(
    kit.contributions,
    kit.transactions,
    kit.numbering,
    kit.audit,
    kit.clock,
  );
  const voider = new VoidContributionUseCase(
    kit.contributions,
    kit.transactions,
    kit.audit,
  );
  const list = new ListContributionsUseCase(kit.contributions, kit.clock);
  const get = new GetContributionUseCase(kit.contributions);
  const formOptions = new GetContributionFormOptionsUseCase(
    kit.contributions,
    kit.clock,
  );
  const exporter = new ExportContributionsUseCase(
    kit.contributions,
    kit.audit,
    kit.clock,
  );
  const search = new SearchContributorsUseCase(kit.contributors);
  const treasurer = actingIn(TENANT_A);
  const add = (overrides: Record<string, unknown> = {}, actor = treasurer) =>
    record.execute(actor, {
      contributionTypeId: TYPE.tithe,
      personId: PERSON.ana,
      receivedOn: TODAY,
      amount: 100_000,
      paymentMethod: 'CASH',
      paymentReference: null,
      vowPledgeId: null,
      notes: null,
      ...overrides,
    });
  return {
    kit,
    record,
    voider,
    list,
    get,
    formOptions,
    exporter,
    search,
    treasurer,
    add,
  };
}

const PAGE = { page: 1, pageSize: 10 };

describe('ListContributionsUseCase', () => {
  it('defaults to the month of today and totals the valid contributions per category', async () => {
    const { list, treasurer, add, voider } = setup();
    await add({ amount: 100_000 });
    await add({
      contributionTypeId: TYPE.offering,
      personId: null,
      amount: 50_000,
    });
    const voided = await add({ amount: 999_999 });
    await voider.execute(treasurer, voided.id, 'Valor digitado con error.');

    const result = await list.execute(treasurer, PAGE);

    expect(result).toMatchObject({
      from: '2026-11-01',
      to: '2026-11-30',
      label: 'Noviembre 2026',
      periodStatus: 'OPEN',
      total: 3,
      totalAmount: 150_000,
      voidedCount: 1,
    });
    const byCategory = Object.fromEntries(
      result.summary.map((s) => [s.category, s]),
    );
    expect(byCategory['TITHE']).toMatchObject({
      amount: 100_000,
      count: 1,
      share: 67,
    });
    expect(byCategory['OFFERING']).toMatchObject({
      amount: 50_000,
      count: 1,
      share: 33,
    });
    expect(byCategory['VOW']).toMatchObject({ amount: 0, count: 0 });
    expect(byCategory['OTHER']).toBeUndefined();
  });

  it('reports the status of the period of the sede, and none when it is not one month of one sede', async () => {
    const { list, treasurer } = setup();

    const october = await list.execute(treasurer, {
      ...PAGE,
      year: 2026,
      month: 10,
    });
    const range = await list.execute(treasurer, {
      ...PAGE,
      from: '2026-10-01',
      to: '2026-11-30',
    });
    const wide = await list.execute(actingIn(TENANT_A_WIDE), PAGE);

    expect(october.periodStatus).toBe('CLOSED');
    expect(range.periodStatus).toBeNull();
    expect(wide.periodStatus).toBeNull();
  });

  it('filters by category, method, status and search text', async () => {
    const { list, treasurer, add, voider, kit } = setup();
    await add({ amount: 10_000 });
    await add({
      contributionTypeId: TYPE.offering,
      personId: PERSON.luis,
      amount: 20_000,
      paymentMethod: 'CARD',
      paymentReference: 'TRX-77',
    });
    const settled = await add({ amount: 30_000 });
    kit.world.contributions.find((c) => c.id === settled.id)!.settled = true;
    const voided = await add({ amount: 40_000 });
    await voider.execute(
      treasurer,
      voided.id,
      'Anulado por error de digitación.',
    );

    const ids = async (query: object) =>
      (await list.execute(treasurer, { ...PAGE, ...query })).items.map(
        (i) => i.amount,
      );

    expect(await ids({ category: 'OFFERING' })).toEqual([20_000]);
    expect(await ids({ paymentMethod: 'CARD' })).toEqual([20_000]);
    expect(await ids({ status: 'SETTLED' })).toEqual([30_000]);
    expect(await ids({ status: 'VOIDED' })).toEqual([40_000]);
    expect(await ids({ status: 'RECORDED' })).toEqual([20_000, 10_000]);
    expect(await ids({ search: 'TRX-77' })).toEqual([20_000]);
    expect(await ids({ search: 'gómez' })).toEqual([20_000]);
  });

  it('keeps the totals of the filter when the voided status is requested', async () => {
    const { list, treasurer, add, voider } = setup();
    await add({ amount: 10_000 });
    const voided = await add({ amount: 40_000 });
    await voider.execute(
      treasurer,
      voided.id,
      'Anulado por error de digitación.',
    );

    const result = await list.execute(treasurer, { ...PAGE, status: 'VOIDED' });

    expect(result).toMatchObject({ total: 1, totalAmount: 0, voidedCount: 1 });
  });

  it('paginates on the server, newest first', async () => {
    const { list, treasurer, add } = setup();
    for (let n = 1; n <= 5; n += 1) {
      await add({ amount: n * 1_000 });
    }

    const second = await list.execute(treasurer, { page: 2, pageSize: 2 });

    expect(second).toMatchObject({ total: 5, page: 2, pageSize: 2 });
    expect(second.items.map((i) => i.amount)).toEqual([3_000, 2_000]);
  });

  it('rejects a malformed or inverted range and a range of more than two years', async () => {
    const { list, treasurer } = setup();
    const code = async (query: object) =>
      (
        (await list
          .execute(treasurer, { ...PAGE, ...query })
          .catch((e: unknown) => e)) as { code?: string }
      ).code;

    expect(await code({ from: '2026-11-10', to: '2026-11-01' })).toBe(
      'INVALID_RANGE',
    );
    expect(await code({ from: '2026-11-10' })).toBe('INVALID_RANGE');
    expect(await code({ from: '2020-01-01', to: '2026-11-01' })).toBe(
      'INVALID_RANGE',
    );
  });

  it('shows every sede of the denomination to a denomination-wide session, and only its own to a sede', async () => {
    const { list, add } = setup();
    await add({}, actingIn(TENANT_A));
    await add({ personId: PERSON.luis }, actingIn(TENANT_A_SIBLING));

    const wide = await list.execute(actingIn(TENANT_A_WIDE), PAGE);
    const central = await list.execute(actingIn(TENANT_A), PAGE);
    const narrowed = await list.execute(actingIn(TENANT_A_WIDE), {
      ...PAGE,
      congregationId: 11,
    });

    expect(wide.items.map((i) => i.congregationName).sort()).toEqual([
      'Sede Central',
      'Sede Norte',
    ]);
    expect(central.items.map((i) => i.congregationName)).toEqual([
      'Sede Central',
    ]);
    expect(narrowed.items.map((i) => i.congregationName)).toEqual([
      'Sede Norte',
    ]);
  });

  it('never lists the contributions of another denomination', async () => {
    const { list, add } = setup();
    await add();

    const other = await list.execute(actingIn(TENANT_B), PAGE);

    expect(other).toMatchObject({ total: 0, totalAmount: 0, voidedCount: 0 });
  });

  it('answers 404 when a sede session asks for a different sede', async () => {
    const { list, treasurer } = setup();

    const error = await list
      .execute(treasurer, { ...PAGE, congregationId: 11 })
      .catch((e: unknown) => e);

    expect((error as { code?: string }).code).toBe('NOT_FOUND');
  });
});

describe('GetContributionUseCase', () => {
  it('returns the detail with who recorded it', async () => {
    const { get, treasurer, add } = setup();
    const row = await add();

    const detail = await get.execute(treasurer, row.id);

    expect(detail).toMatchObject({
      id: row.id,
      recordedByName: 'Tesorera',
      consolidationVoucher: null,
    });
  });

  describeCrossTenantIsolation('GetContributionUseCase', {
    arrange: async () => {
      const ctx = setup();
      const row = await ctx.add();
      return { id: row.id, get: ctx.get };
    },
    act: (scope, { id, get }) => get.execute(actingIn(scope), id),
  });
});

describe('GetContributionFormOptionsUseCase', () => {
  it('describes a sede: open months, allowed dates, settled ranges and the next receipt', async () => {
    const { formOptions, treasurer, add, kit } = setup();
    await add();
    kit.world.settlements.push({
      denominationId: 1,
      congregationId: 10,
      from: '2026-10-01',
      to: '2026-10-31',
    });

    const options = await formOptions.execute(treasurer);

    expect(options).toMatchObject({
      today: TODAY,
      congregationScoped: true,
      scopeLabel: 'Sede Central',
      minDate: '2026-11-01',
      maxDate: TODAY,
      nextReceiptNumber: 'REC-2026-00002',
      settledTitheRanges: [{ from: '2026-10-01', to: '2026-10-31' }],
    });
    expect(options.types.map((t) => t.name)).toEqual([
      'Diezmo',
      'Ofrenda',
      'Voto',
      'Primicia',
    ]);
    expect(options.periods.map((p) => `${p.label}:${p.status}`)).toEqual([
      'Noviembre 2026:OPEN',
      'Octubre 2026:CLOSED',
    ]);
  });

  it('is read-only and aggregated for a denomination-wide session', async () => {
    const { formOptions } = setup();

    const options = await formOptions.execute(actingIn(TENANT_A_WIDE));

    expect(options).toMatchObject({
      congregationScoped: false,
      scopeLabel: 'todas las sedes',
      minDate: null,
      maxDate: null,
      nextReceiptNumber: null,
      settledTitheRanges: [],
    });
    // November counts as open because some sede still has it open.
    expect(options.periods.find((p) => p.month === 11)?.status).toBe('OPEN');
  });

  it('shows the types of the own denomination only', async () => {
    const { formOptions } = setup();

    const options = await formOptions.execute(actingIn(TENANT_B));

    expect(options.types.map((t) => t.id)).toEqual([
      TYPE.otherDenominationTithe,
    ]);
  });
});

describe('ExportContributionsUseCase', () => {
  it('writes a CSV with BOM, one line per contribution, and audits only the row count', async () => {
    const { exporter, treasurer, add, kit } = setup();
    await add({ amount: 250_000, notes: '=cmd|calc' });

    const file = await exporter.execute(
      treasurer,
      { year: 2026, month: 11 },
      '10.0.0.1',
    );

    expect(file.filename).toBe('aportes-2026-11-01_2026-11-30.csv');
    expect(file.rows).toBe(1);
    expect(file.content.startsWith(`${CSV_BOM}Fecha;Recibo;`)).toBe(true);
    const line = file.content.split('\r\n')[1];
    expect(line).toContain(
      '02/11/2026;REC-2026-00001;Diezmo;Diezmo;Ana Pérez;SC-0130',
    );
    expect(line).toContain(';250000;Registrado;');
    // A note that would run as a spreadsheet formula is neutralized.
    expect(line).toContain(";'=cmd|calc;");
    const entry = kit.audit.entries.at(-1)!;
    expect(entry).toMatchObject({
      action: 'CONTRIBUTIONS_EXPORTED',
      ipAddress: '10.0.0.1',
    });
    expect(entry.changes).toEqual({ rows: { from: null, to: 1 } });
  });

  it('exports only the contributions of the tenant', async () => {
    const { exporter, add } = setup();
    await add();

    const file = await exporter.execute(actingIn(TENANT_B), {
      year: 2026,
      month: 11,
    });

    expect(file.rows).toBe(0);
  });
});

describe('SearchContributorsUseCase', () => {
  it('returns nothing for fewer than two characters', async () => {
    const { search, treasurer } = setup();

    expect(await search.execute(treasurer, ' a ')).toEqual([]);
  });

  it('masks the document and shows the member code', async () => {
    const { search, treasurer } = setup();

    const [ana] = await search.execute(treasurer, 'Ana');

    expect(ana).toEqual({
      id: PERSON.ana,
      fullName: 'Ana Pérez',
      memberCode: 'SC-0130',
      congregationName: 'Sede Central',
      documentHint: 'CC ···1904',
    });
    expect(JSON.stringify(ana)).not.toContain('52341904');
  });

  it('puts the members of the active sede first', async () => {
    const { search, kit } = setup();
    kit.world.persons.push({
      id: 20,
      denominationId: 1,
      firstName: 'Ana',
      lastName: 'Zapata',
      documentTypeCode: 'CC',
      documentNumber: '555',
      memberNumber: 9,
      congregationId: 11,
    });
    // Sorting is by sede, not by the order the repository returns.
    kit.world.persons.sort((a, b) => b.id - a.id);

    const fromNorte = await search.execute(actingIn(TENANT_A_SIBLING), 'Ana');
    const fromCentral = await search.execute(actingIn(TENANT_A), 'Ana');

    expect(fromNorte[0].fullName).toBe('Ana Zapata');
    expect(fromCentral[0].fullName).toBe('Ana Pérez');
  });

  it('never returns deceased members, deleted people or people of another denomination', async () => {
    const { search, treasurer, kit } = setup();
    kit.world.persons.push({
      id: 21,
      denominationId: 1,
      firstName: 'Ana',
      lastName: 'Borrada',
      documentTypeCode: 'CC',
      documentNumber: '777',
      memberNumber: 12,
      congregationId: 10,
      deleted: true,
    });

    const names = (await search.execute(treasurer, 'Ana')).map(
      (p) => p.fullName,
    );
    const deceased = await search.execute(treasurer, 'Anselmo');

    expect(names).toEqual(['Ana Pérez']);
    expect(deceased).toEqual([]);
  });

  it('caps the results at eight', async () => {
    const { search, treasurer, kit } = setup();
    for (let n = 0; n < 12; n += 1) {
      kit.world.persons.push({
        id: 100 + n,
        denominationId: 1,
        firstName: 'Beto',
        lastName: `Apellido${n}`,
        documentTypeCode: null,
        documentNumber: null,
        memberNumber: n + 1,
        congregationId: 10,
      });
    }

    const results = await search.execute(treasurer, 'Beto');

    expect(results).toHaveLength(8);
    expect(results[0].documentHint).toBe('—');
  });
});
