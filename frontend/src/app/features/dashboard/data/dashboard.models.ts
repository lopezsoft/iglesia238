// View models of GET /api/dashboard/summary. The API decides which widgets the role of the active
// scope can read and every area contributes its own: the page renders what arrives, nothing else.
import { ChipTone } from '../../../shared/ui/icon-chip.component';
import { SegmentOption } from '../../../shared/ui/segmented-control.component';

export type DashboardPeriod = 'today' | 'yesterday' | '7d' | 'month';
export const DEFAULT_PERIOD: DashboardPeriod = 'today';

export const PERIOD_OPTIONS: readonly SegmentOption<DashboardPeriod>[] = [
  { value: 'today', label: 'Hoy' },
  { value: 'yesterday', label: 'Ayer' },
  { value: '7d', label: '7 días' },
  { value: 'month', label: 'Mes' },
];

export function isDashboardPeriod(value: string): value is DashboardPeriod {
  return PERIOD_OPTIONS.some((option) => option.value === value);
}

export type DashboardTab = 'general' | 'indicators';

/** currency: pesos; integer: a count; text: already written by the API. */
export type WidgetFormat = 'currency' | 'integer' | 'text';

export interface DateRange {
  /** YYYY-MM-DD, inclusive. */
  readonly from: string;
  readonly to: string;
}

export interface DashboardScopeInfo {
  readonly kind: 'PLATFORM' | 'DENOMINATION' | 'CONGREGATION';
  readonly label: string;
  readonly denominationName: string | null;
}

/** The headline figure: compared with the previous period, with a sparkline when there is history. */
export interface HeroWidget {
  readonly key: string;
  readonly priority: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly label: string;
  readonly value: number;
  readonly format: 'currency' | 'integer';
  /** Value of the comparison period; null when it cannot be known. */
  readonly previous: number | null;
  /** One value per day; empty when there is nothing to draw. */
  readonly series: readonly number[];
  readonly link: string | null;
}

export interface KpiWidget {
  readonly key: string;
  readonly order: number;
  readonly tab: DashboardTab;
  readonly label: string;
  readonly value: number | string;
  readonly format: WidgetFormat;
  readonly hint: string | null;
  /** Name of an icon of the library; unknown names fall back to a neutral one. */
  readonly icon: string;
  readonly tone: ChipTone;
  readonly link: string | null;
  readonly previous: number | null;
}

export interface PanelStat {
  readonly key: string;
  readonly label: string;
  readonly value: number | string;
  readonly format: WidgetFormat;
  readonly meta: string | null;
  readonly icon: string;
  readonly tone: ChipTone;
}

export interface PanelWidget {
  readonly key: string;
  readonly order: number;
  readonly tab: DashboardTab;
  readonly title: string;
  readonly subtitle: string | null;
  readonly icon: string;
  readonly tone: ChipTone;
  readonly link: string | null;
  readonly linkLabel: string | null;
  readonly stats: readonly PanelStat[];
}

export interface ListItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  /** ISO 8601 date-time. */
  readonly occurredAt: string | null;
  readonly badge: { readonly label: string; readonly tone: ChipTone } | null;
}

export interface ListWidget {
  readonly key: string;
  readonly order: number;
  readonly tab: DashboardTab;
  readonly title: string;
  readonly subtitle: string | null;
  readonly icon: string;
  readonly tone: ChipTone;
  readonly emptyText: string;
  readonly link: string | null;
  readonly linkLabel: string | null;
  readonly items: readonly ListItem[];
}

export interface TrendPoint {
  readonly label: string;
  readonly value: number;
}

export interface TrendWidget {
  readonly key: string;
  readonly order: number;
  readonly tab: DashboardTab;
  readonly title: string;
  readonly subtitle: string | null;
  readonly format: 'currency' | 'integer';
  readonly tone: ChipTone;
  readonly points: readonly TrendPoint[];
}

export interface DashboardSummary {
  readonly period: DashboardPeriod;
  /** "Hoy", "Ayer", "7 días", "Mes". */
  readonly periodLabel: string;
  /** How the comparison reads: "ayer", "los 7 días anteriores". */
  readonly previousLabel: string;
  /** Today in Bogota (YYYY-MM-DD). */
  readonly asOf: string;
  readonly range: DateRange;
  readonly scope: DashboardScopeInfo;
  readonly hero: HeroWidget | null;
  readonly kpis: readonly KpiWidget[];
  readonly panels: readonly PanelWidget[];
  readonly lists: readonly ListWidget[];
  readonly trends: readonly TrendWidget[];
  /** Areas whose figures could not be loaded: the page says so instead of showing zeros. */
  readonly unavailable: readonly string[];
}

/** One-line description of each module for the quick-access grid, by route path. */
export const MODULE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  '/denominations': 'Alta y estado de cada denominación',
  '/organization': 'Razones sociales, distritos y sedes',
  '/users': 'Invitar usuarios y asignar roles por sede',
  '/applications': 'Aprobar, rechazar o marcar duplicadas',
  '/members': 'Hoja de vida, familia y ficha socioeconómica',
  '/certificates': 'Emitir con consecutivo y renovar carnés',
  '/attendance': 'Escuela dominical por categorías',
  '/secretariat-records': 'Presentaciones, matrimonios y periodos pastorales',
  '/accounting/contributions': 'Diezmos, ofrendas, primicias y votos',
  '/accounting/vows': 'Promesas, abonos y saldos pendientes',
  '/accounting/cash-book': 'Ingresos, egresos y cierre de periodos',
  '/accounting/tithe-settlements': 'Diezmo de diezmos y asignación pastoral',
  '/accounting/budget': 'Presupuesto anual y ejecución',
  '/accounting/setup': 'Fondos, plan de cuentas y tipos de aporte',
  '/reports': 'Ingresos, egresos y saldos por fondo',
  '/audit': 'Quién hizo qué, cuándo y desde dónde',
};
