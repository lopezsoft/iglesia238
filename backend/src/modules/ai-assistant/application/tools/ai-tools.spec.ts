import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { InvalidInputException } from '../../../../common/errors/domain.exception.js';
import type { GetAttendanceStats } from '../../../attendance/application/get-attendance-stats.use-case.js';
import type { ListMembersUseCase } from '../../../membership/application/use-cases/list-members.use-case.js';
import type { GetFinancialReportUseCase } from '../../../reports/application/get-financial-report.use-case.js';
import type { GetTitheOverviewUseCase } from '../../../tithe-settlements/application/get-tithe-overview.use-case.js';
import type { ListTitheSettlementsUseCase } from '../../../tithe-settlements/application/list-tithe-settlements.use-case.js';
import {
  AttendanceStatsTool,
  FinancialSummaryTool,
  MembershipSummaryTool,
  TitheSummaryTool,
} from './ai-tools.js';

const sede = buildTenantContext({
  permissions: [
    'reports.read',
    'attendance.write',
    'tithe-settlements.write',
    'members.read',
  ],
});
const wide = buildTenantContext({
  kind: 'DENOMINATION',
  permissions: [
    'reports.read',
    'attendance.write',
    'tithe-settlements.write',
    'members.read',
  ],
});

const REPORT = {
  query: {
    from: '2026-01-01',
    to: '2026-10-31',
    fundId: null,
    congregationId: null,
  },
  scopeLabel: 'Sede Central',
  fundLabel: 'Todos los fondos',
  totals: { income: 10_000_000, expense: 6_000_000, balance: 4_000_000 },
  previous: {
    from: '2025-03-01',
    to: '2025-12-31',
    income: 9_000_000,
    expense: 5_000_000,
    balance: 4_000_000,
  },
  months: [
    {
      year: 2026,
      month: 10,
      label: 'Octubre 2026',
      shortLabel: 'Oct.',
      income: 1_000_000,
      expense: 600_000,
      balance: 400_000,
      periodStatus: 'CLOSED',
    },
  ],
  funds: [
    {
      fundId: 1,
      name: 'Fondo General',
      opening: 100,
      inflows: 1_000,
      outflows: 400,
      closing: 700,
    },
  ],
  accounts: [],
  contributionTypes: [
    {
      contributionTypeId: 1,
      name: 'Diezmos',
      category: 'TITHE',
      count: 40,
      amount: 5_000_000,
      share: 0.5,
    },
  ],
  contributionsTotal: 5_000_000,
  contributionsCount: 40,
  pendingConsolidation: { count: 2, amount: 80_000 },
  otherIncome: 0,
  congregations: null,
  closedPeriods: 9,
  openPeriods: 1,
};

describe('FinancialSummaryTool', () => {
  it('asks the report for the range and fund of the arguments, on the sede of the person', async () => {
    const execute = vi.fn().mockResolvedValue(REPORT);
    const tool = new FinancialSummaryTool({
      execute,
    } as unknown as GetFinancialReportUseCase);

    await tool.run(sede, {
      desde: '2026-01-01',
      hasta: '2026-10-31',
      fondo_id: 3,
    });

    expect(execute).toHaveBeenCalledWith(sede, {
      from: '2026-01-01',
      to: '2026-10-31',
      fundId: 3,
      congregationId: null,
    });
  });

  it('answers in the language of the model with the figures and the balance of each fund', async () => {
    const tool = new FinancialSummaryTool({
      execute: vi.fn().mockResolvedValue(REPORT),
    } as unknown as GetFinancialReportUseCase);

    const answer = await tool.run(sede, {
      desde: '2026-01-01',
      hasta: '2026-10-31',
    });

    expect(answer).toMatchObject({
      sede: 'Sede Central',
      totales: { ingresos: 10_000_000, egresos: 6_000_000, neto: 4_000_000 },
      por_mes: [
        { mes: 'Octubre 2026', ingresos: 1_000_000, periodo_cerrado: true },
      ],
      saldos_por_fondo: [
        { fondo_id: 1, fondo: 'Fondo General', saldo_final: 700 },
      ],
      aportes_por_tipo: [{ tipo: 'Diezmos', cantidad: 40, monto: 5_000_000 }],
      aportes_pendientes_de_pasar_al_libro: { cantidad: 2, monto: 80_000 },
    });
  });

  it('carries no name of a person', async () => {
    const tool = new FinancialSummaryTool({
      execute: vi.fn().mockResolvedValue(REPORT),
    } as unknown as GetFinancialReportUseCase);

    const text = JSON.stringify(
      await tool.run(sede, { desde: '2026-01-01', hasta: '2026-10-31' }),
    );

    expect(text).not.toMatch(/contributorName|persona|documento/i);
  });

  it.each([
    [{ hasta: '2026-10-31' }, 'Falta «desde»'],
    [{ desde: '2026-01-01' }, 'Falta «hasta»'],
    [{ desde: 'enero', hasta: '2026-10-31' }, 'AAAA-MM-DD'],
    [{ desde: '2026-13-45', hasta: '2026-10-31' }, 'AAAA-MM-DD'],
    [{ desde: '2026-01-01', hasta: 20261031 }, 'AAAA-MM-DD'],
  ])(
    'rejects arguments the model got wrong, saying how to fix them: %j',
    async (input, hint) => {
      const execute = vi.fn();
      const tool = new FinancialSummaryTool({
        execute,
      } as unknown as GetFinancialReportUseCase);

      await expect(tool.run(sede, input)).rejects.toThrow(hint);
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it.each([[0], [-1], [1.5], ['2']])(
    'rejects a fund id that is not a positive integer: %j',
    async (fund) => {
      const tool = new FinancialSummaryTool({
        execute: vi.fn(),
      } as unknown as GetFinancialReportUseCase);

      await expect(
        tool.run(sede, {
          desde: '2026-01-01',
          hasta: '2026-10-31',
          fondo_id: fund,
        }),
      ).rejects.toBeInstanceOf(InvalidInputException);
    },
  );

  it('asks a denomination-wide session to pick a sede', async () => {
    const tool = new FinancialSummaryTool({
      execute: vi.fn(),
    } as unknown as GetFinancialReportUseCase);

    await expect(
      tool.run(wide, { desde: '2026-01-01', hasta: '2026-10-31' }),
    ).rejects.toThrow('Selecciona una sede');
  });
});

describe('AttendanceStatsTool', () => {
  const STATS = {
    groupBy: 'month',
    from: '2025-12-01',
    to: '2026-11-08',
    sessionCount: 40,
    series: [
      {
        period: '2026-10',
        sessions: 4,
        total: 400,
        average: 100,
        byCategory: { WOMEN: 150 },
      },
    ],
    average: 98.5,
    max: { sessionDate: '2026-10-04', total: 130 },
    yearOverYear: {
      year: 2026,
      previousYear: 2025,
      average: 98.5,
      previousAverage: 90,
      changePercent: 9.4,
    },
  };

  it('asks the statistics with the arguments it understands', async () => {
    const execute = vi.fn().mockResolvedValue(STATS);
    const tool = new AttendanceStatsTool({
      execute,
    } as unknown as GetAttendanceStats);

    await tool.run(sede, {
      agrupar_por: 'ano',
      desde: '2024-01-01',
      hasta: '2026-11-08',
      tipo_reunion: 'SUNDAY_SERVICE',
    });

    expect(execute).toHaveBeenCalledWith(sede, {
      groupBy: 'year',
      meetingTypeCode: 'SUNDAY_SERVICE',
      from: '2024-01-01',
      to: '2026-11-08',
    });
  });

  it('groups by month and sends no filter when the arguments are empty', async () => {
    const execute = vi.fn().mockResolvedValue(STATS);
    const tool = new AttendanceStatsTool({
      execute,
    } as unknown as GetAttendanceStats);

    await tool.run(sede, {});

    expect(execute).toHaveBeenCalledWith(sede, { groupBy: 'month' });
  });

  it('answers with the average, the best meeting and the comparison with last year', async () => {
    const tool = new AttendanceStatsTool({
      execute: vi.fn().mockResolvedValue(STATS),
    } as unknown as GetAttendanceStats);

    expect(await tool.run(sede, {})).toMatchObject({
      reuniones: 40,
      promedio_por_reunion: 98.5,
      reunion_con_mas_asistencia: { fecha: '2026-10-04', total: 130 },
      comparacion_con_el_ano_anterior: { cambio_porcentual: 9.4 },
      serie: [
        { periodo: '2026-10', total: 400, por_categoria: { WOMEN: 150 } },
      ],
    });
  });

  it('rejects a grouping it does not know', async () => {
    const tool = new AttendanceStatsTool({
      execute: vi.fn(),
    } as unknown as GetAttendanceStats);

    await expect(tool.run(sede, { agrupar_por: 'semana' })).rejects.toThrow(
      'mes, ano',
    );
  });
});

describe('TitheSummaryTool', () => {
  it('joins the overview and the latest settlements', async () => {
    const tool = new TitheSummaryTool(
      {
        execute: vi.fn().mockResolvedValue({
          today: '2026-11-08',
          congregationScoped: true,
          congregationName: 'Sede Central',
          rule: {
            id: 1,
            effectiveFrom: '2026-01-01',
            nationalShareRate: 0.1,
            localFundRate: 0.2,
            inForce: true,
          },
          lastIssued: { from: '2026-10-01', to: '2026-10-31' },
          yearSummary: {
            year: 2026,
            issuedCount: 10,
            grossTithe: 10_000_000,
            nationalShare: 1_000_000,
            localFundShare: 2_000_000,
            pastorNet: 7_000_000,
          },
        }),
      } as unknown as GetTitheOverviewUseCase,
      {
        execute: vi.fn().mockResolvedValue({
          items: [
            {
              id: 5,
              number: 'LD-2026-00005',
              coveredFrom: '2026-10-01',
              coveredTo: '2026-10-31',
              grossTithe: 1_000_000,
              nationalShare: 100_000,
              localFundShare: 200_000,
              pastorNet: 700_000,
              status: 'ISSUED',
            },
            { id: 4, number: 'LD-2026-00004', status: 'VOIDED' },
          ],
        }),
      } as unknown as ListTitheSettlementsUseCase,
    );

    expect(await tool.run(sede)).toMatchObject({
      sede: 'Sede Central',
      porcentajes_vigentes: { participacion_nacional: 0.1, fondo_local: 0.2 },
      resumen_del_ano: { diezmo_bruto: 10_000_000, neto_del_pastor: 7_000_000 },
      liquidaciones_recientes: [
        { numero: 'LD-2026-00005', estado: 'emitida', diezmo_bruto: 1_000_000 },
        { numero: 'LD-2026-00004', estado: 'anulada' },
      ],
    });
  });

  it('asks for the five latest settlements of the sede', async () => {
    const list = vi.fn().mockResolvedValue({ items: [] });
    const tool = new TitheSummaryTool(
      {
        execute: vi.fn().mockResolvedValue({
          today: '2026-11-08',
          congregationName: 'Sede Central',
          rule: null,
          lastIssued: null,
          yearSummary: null,
        }),
      } as unknown as GetTitheOverviewUseCase,
      { execute: list } as unknown as ListTitheSettlementsUseCase,
    );

    const answer = await tool.run(sede);

    expect(list).toHaveBeenCalledWith(sede, {
      status: null,
      from: null,
      to: null,
      page: 1,
      pageSize: 5,
    });
    expect(answer).toMatchObject({
      porcentajes_vigentes: null,
      resumen_del_ano: null,
    });
  });
});

describe('MembershipSummaryTool', () => {
  it('counts members by status, sex and age, and nothing else', async () => {
    const execute = vi
      .fn()
      .mockImplementation((_scope, query: Record<string, unknown>) =>
        Promise.resolve({
          items: [{ fullName: 'No debe salir' }],
          total:
            query.sex === 'FEMALE'
              ? 60
              : query.sex === 'MALE'
                ? 40
                : query.ageRange === 'ADULTS'
                  ? 55
                  : 10,
          statusCounts: {
            ALL: 120,
            ACTIVE: 100,
            INACTIVE: 12,
            TRANSFERRED: 5,
            DECEASED: 3,
          },
        }),
      );
    const tool = new MembershipSummaryTool({
      execute,
    } as unknown as ListMembersUseCase);

    const answer = await tool.run(sede);

    expect(answer).toMatchObject({
      por_estado: {
        activos: 100,
        inactivos: 12,
        trasladados: 5,
        fallecidos: 3,
        total: 120,
      },
      activos_por_sexo: { mujeres: 60, hombres: 40 },
      activos_por_edad: { adultos_30_a_59: 55, ninos_0_a_11: 10 },
    });
    expect(JSON.stringify(answer)).not.toContain('No debe salir');
  });

  it('reads only the count: one row per query and only the active ones for sex and age', async () => {
    const execute = vi.fn().mockResolvedValue({
      items: [],
      total: 0,
      statusCounts: {
        ALL: 0,
        ACTIVE: 0,
        INACTIVE: 0,
        TRANSFERRED: 0,
        DECEASED: 0,
      },
    });
    const tool = new MembershipSummaryTool({
      execute,
    } as unknown as ListMembersUseCase);

    await tool.run(sede);

    const queries = execute.mock.calls.map(
      ([, query]) => query as Record<string, unknown>,
    );
    expect(queries.every((query) => query.pageSize === 1)).toBe(true);
    expect(queries.filter((query) => query.status === 'ALL')).toHaveLength(1);
    expect(
      queries.filter(
        (query) =>
          query.status === 'ACTIVE' &&
          (query.sex !== 'ALL' || query.ageRange !== 'ALL'),
      ),
    ).toHaveLength(7);
  });
});
