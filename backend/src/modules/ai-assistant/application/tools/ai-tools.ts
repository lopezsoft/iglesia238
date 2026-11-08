import { Injectable } from '@nestjs/common';
import { requireCongregationScope } from '../../../../common/accounting/congregation-scope.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type {
  AgeRange,
  Sex,
} from '../../../membership/application/member.models.js';
import { ListMembersUseCase } from '../../../membership/application/use-cases/list-members.use-case.js';
import { GetAttendanceStats } from '../../../attendance/application/get-attendance-stats.use-case.js';
import { GetFinancialReportUseCase } from '../../../reports/application/get-financial-report.use-case.js';
import { GetTitheOverviewUseCase } from '../../../tithe-settlements/application/get-tithe-overview.use-case.js';
import { ListTitheSettlementsUseCase } from '../../../tithe-settlements/application/list-tithe-settlements.use-case.js';
import {
  type AiTool,
  optionalChoice,
  optionalDate,
  optionalPositiveInt,
  requiredDate,
} from './ai-tool.js';

const SEDE_ACTION = 'consultar los datos con el asistente';

/** Income, expense and fund balances of a range, the same figures as the Reportes screen. */
@Injectable()
export class FinancialSummaryTool implements AiTool {
  readonly name = 'resumen_financiero';
  readonly title = 'Resumen financiero';
  readonly permission = 'reports.read';
  readonly description =
    'Ingresos, egresos y saldos por fondo de la sede en un rango de fechas que debe estar dentro de un mismo año. ' +
    'Devuelve montos en pesos colombianos (COP): totales del rango y del rango anterior de igual duración, detalle por mes, ' +
    'saldo de cada fondo (con su id), aportes por tipo (diezmos, ofrendas, primicias, votos) y aportes registrados que todavía ' +
    'no se pasan al libro de caja. Solo cifras agregadas.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      desde: { type: 'string', description: 'Fecha inicial, AAAA-MM-DD.' },
      hasta: {
        type: 'string',
        description: 'Fecha final, AAAA-MM-DD, del mismo año que «desde».',
      },
      fondo_id: {
        type: 'integer',
        description:
          'Opcional. Id de un fondo (sale en saldos_por_fondo) para limitar las cifras a ese fondo; sin él se suman todos.',
      },
    },
    required: ['desde', 'hasta'],
    additionalProperties: false,
  } as const;

  constructor(private readonly report: GetFinancialReportUseCase) {}

  async run(
    tenant: TenantContext,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    requireCongregationScope(tenant, SEDE_ACTION);
    const result = await this.report.execute(tenant, {
      from: requiredDate(input, 'desde'),
      to: requiredDate(input, 'hasta'),
      fundId: optionalPositiveInt(input, 'fondo_id'),
      congregationId: null,
    });
    return {
      sede: result.scopeLabel,
      fondo: result.fundLabel,
      rango: { desde: result.query.from, hasta: result.query.to },
      totales: {
        ingresos: result.totals.income,
        egresos: result.totals.expense,
        neto: result.totals.balance,
      },
      rango_anterior: {
        desde: result.previous.from,
        hasta: result.previous.to,
        ingresos: result.previous.income,
        egresos: result.previous.expense,
        neto: result.previous.balance,
      },
      por_mes: result.months.map((month) => ({
        mes: month.label,
        ingresos: month.income,
        egresos: month.expense,
        periodo_cerrado: month.periodStatus === 'CLOSED',
      })),
      saldos_por_fondo: result.funds.map((fund) => ({
        fondo_id: fund.fundId,
        fondo: fund.name,
        saldo_inicial: fund.opening,
        entradas: fund.inflows,
        salidas: fund.outflows,
        saldo_final: fund.closing,
      })),
      aportes_por_tipo: result.contributionTypes.map((type) => ({
        tipo: type.name,
        categoria: type.category,
        cantidad: type.count,
        monto: type.amount,
      })),
      aportes_pendientes_de_pasar_al_libro: {
        cantidad: result.pendingConsolidation.count,
        monto: result.pendingConsolidation.amount,
      },
      periodos_cerrados: result.closedPeriods,
      periodos_abiertos: result.openPeriods,
    };
  }
}

const GROUPINGS = ['mes', 'ano'] as const;

/** Headcount of the meetings, the same figures as the Asistencia screen. */
@Injectable()
export class AttendanceStatsTool implements AiTool {
  readonly name = 'estadisticas_asistencia';
  readonly title = 'Asistencia a las reuniones';
  readonly permission = 'attendance.write';
  readonly description =
    'Asistencia a las reuniones de la sede: número de reuniones, promedio, la reunión con más asistencia, la serie por mes o por año ' +
    '(con el desglose por categoría: niños, adolescentes, hermanas, hermanos y visitas) y la comparación del promedio con el año anterior. ' +
    'Sin fechas devuelve los últimos 12 meses.';
  readonly inputSchema = {
    type: 'object',
    properties: {
      agrupar_por: {
        type: 'string',
        enum: [...GROUPINGS],
        description: 'Cómo agrupar la serie: «mes» (por defecto) o «ano».',
      },
      desde: {
        type: 'string',
        description: 'Opcional. Fecha inicial, AAAA-MM-DD.',
      },
      hasta: {
        type: 'string',
        description: 'Opcional. Fecha final, AAAA-MM-DD.',
      },
      tipo_reunion: {
        type: 'string',
        description:
          'Opcional. Código del tipo de reunión: SUNDAY_SCHOOL, SUNDAY_SERVICE, PRAYER_MEETING, MIDWEEK_SERVICE, YOUTH_MEETING, WOMEN_MEETING, MEN_MEETING, CHILDREN_MEETING o SPECIAL_SERVICE. Sin él se suman todas.',
      },
    },
    additionalProperties: false,
  } as const;

  constructor(private readonly stats: GetAttendanceStats) {}

  async run(
    tenant: TenantContext,
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown> {
    requireCongregationScope(tenant, SEDE_ACTION);
    const grouping = optionalChoice(input, 'agrupar_por', GROUPINGS) ?? 'mes';
    const meetingType =
      typeof input.tipo_reunion === 'string' && input.tipo_reunion !== ''
        ? input.tipo_reunion
        : undefined;
    const from = optionalDate(input, 'desde');
    const to = optionalDate(input, 'hasta');
    const result = await this.stats.execute(tenant, {
      groupBy: grouping === 'mes' ? 'month' : 'year',
      ...(meetingType !== undefined ? { meetingTypeCode: meetingType } : {}),
      ...(from !== null ? { from } : {}),
      ...(to !== null ? { to } : {}),
    });
    return {
      rango: { desde: result.from, hasta: result.to },
      reuniones: result.sessionCount,
      promedio_por_reunion: result.average,
      reunion_con_mas_asistencia: result.max
        ? { fecha: result.max.sessionDate, total: result.max.total }
        : null,
      comparacion_con_el_ano_anterior: {
        ano: result.yearOverYear.year,
        ano_anterior: result.yearOverYear.previousYear,
        promedio: result.yearOverYear.average,
        promedio_ano_anterior: result.yearOverYear.previousAverage,
        cambio_porcentual: result.yearOverYear.changePercent,
      },
      serie: result.series.map((point) => ({
        periodo: point.period,
        reuniones: point.sessions,
        total: point.total,
        promedio: point.average,
        por_categoria: point.byCategory,
      })),
    };
  }
}

/** The tithe rule in force, the year so far and the latest settlements. */
@Injectable()
export class TitheSummaryTool implements AiTool {
  readonly name = 'resumen_diezmos';
  readonly title = 'Resumen de diezmos y liquidaciones';
  readonly permission = 'tithe-settlements.write';
  readonly description =
    'Estado de la liquidación del diezmo de la sede: porcentajes vigentes (participación nacional y fondo local), ' +
    'el último rango liquidado, el resumen del año en curso (bruto, nacional, fondo local y neto del pastor) y las 5 liquidaciones más recientes con sus montos.';
  readonly inputSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  } as const;

  constructor(
    private readonly overview: GetTitheOverviewUseCase,
    private readonly settlements: ListTitheSettlementsUseCase,
  ) {}

  async run(tenant: TenantContext): Promise<unknown> {
    requireCongregationScope(tenant, SEDE_ACTION);
    const [overview, recent] = await Promise.all([
      this.overview.execute(tenant),
      this.settlements.execute(tenant, {
        status: null,
        from: null,
        to: null,
        page: 1,
        pageSize: 5,
      }),
    ]);
    return {
      sede: overview.congregationName,
      hoy: overview.today,
      porcentajes_vigentes: overview.rule
        ? {
            vigente_desde: overview.rule.effectiveFrom,
            participacion_nacional: overview.rule.nationalShareRate,
            fondo_local: overview.rule.localFundRate,
          }
        : null,
      ultimo_rango_liquidado: overview.lastIssued,
      resumen_del_ano: overview.yearSummary
        ? {
            ano: overview.yearSummary.year,
            liquidaciones_emitidas: overview.yearSummary.issuedCount,
            diezmo_bruto: overview.yearSummary.grossTithe,
            participacion_nacional: overview.yearSummary.nationalShare,
            fondo_local: overview.yearSummary.localFundShare,
            neto_del_pastor: overview.yearSummary.pastorNet,
          }
        : null,
      liquidaciones_recientes: recent.items.map((item) => ({
        numero: item.number,
        desde: item.coveredFrom,
        hasta: item.coveredTo,
        estado: item.status === 'ISSUED' ? 'emitida' : 'anulada',
        diezmo_bruto: item.grossTithe,
        participacion_nacional: item.nationalShare,
        fondo_local: item.localFundShare,
        neto_del_pastor: item.pastorNet,
      })),
    };
  }
}

const SEXES: ReadonlyArray<{ value: Sex; label: string }> = [
  { value: 'FEMALE', label: 'mujeres' },
  { value: 'MALE', label: 'hombres' },
];

const AGE_RANGES: ReadonlyArray<{ value: AgeRange; label: string }> = [
  { value: 'CHILDREN', label: 'ninos_0_a_11' },
  { value: 'TEENAGERS', label: 'adolescentes_12_a_17' },
  { value: 'YOUNG_ADULTS', label: 'jovenes_18_a_29' },
  { value: 'ADULTS', label: 'adultos_30_a_59' },
  { value: 'SENIORS', label: 'mayores_de_60' },
];

/** Counts of members by status, sex and age. Never a name: the figures are all the assistant sees. */
@Injectable()
export class MembershipSummaryTool implements AiTool {
  readonly name = 'miembros_por_estado';
  readonly title = 'Miembros de la sede';
  readonly permission = 'members.read';
  readonly description =
    'Cantidad de miembros de la sede por estado (activos, inactivos, trasladados, fallecidos) y, entre los activos, por sexo y por rango de edad. ' +
    'Solo cantidades: no entrega nombres ni datos de ninguna persona.';
  readonly inputSchema = {
    type: 'object',
    properties: {},
    additionalProperties: false,
  } as const;

  constructor(private readonly members: ListMembersUseCase) {}

  async run(tenant: TenantContext): Promise<unknown> {
    requireCongregationScope(tenant, SEDE_ACTION);
    const scope = tenant.tenantScope();
    const base = {
      text: '',
      status: 'ACTIVE' as const,
      sex: 'ALL' as const,
      ageRange: 'ALL' as const,
      position: 'ALL' as const,
      congregationId: null,
      page: 1,
      pageSize: 1,
      sortBy: 'name' as const,
      order: 'asc' as const,
    };
    const count = async (
      overrides: Partial<{ sex: Sex; ageRange: AgeRange }>,
    ): Promise<number> =>
      (await this.members.execute(scope, { ...base, ...overrides })).total;

    const [all, ...rest] = await Promise.all([
      this.members.execute(scope, { ...base, status: 'ALL' }),
      ...SEXES.map((sex) => count({ sex: sex.value })),
      ...AGE_RANGES.map((range) => count({ ageRange: range.value })),
    ]);
    const bySex = rest.slice(0, SEXES.length);
    const byAge = rest.slice(SEXES.length);
    return {
      por_estado: {
        activos: all.statusCounts.ACTIVE,
        inactivos: all.statusCounts.INACTIVE,
        trasladados: all.statusCounts.TRANSFERRED,
        fallecidos: all.statusCounts.DECEASED,
        total: all.statusCounts.ALL,
      },
      activos_por_sexo: Object.fromEntries(
        SEXES.map((sex, index) => [sex.label, bySex[index]]),
      ),
      activos_por_edad: Object.fromEntries(
        AGE_RANGES.map((range, index) => [range.label, byAge[index]]),
      ),
    };
  }
}
