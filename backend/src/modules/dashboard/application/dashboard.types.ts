import type { ScopeKind } from '../../../common/tenancy/scope-key.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';

export const DASHBOARD_PERIODS = ['today', 'yesterday', '7d', 'month'] as const;
export type DashboardPeriod = (typeof DASHBOARD_PERIODS)[number];
export const DEFAULT_DASHBOARD_PERIOD: DashboardPeriod = 'today';

/** Colors of the design system (icon chips, panels). */
export type WidgetTone =
  'cyan' | 'green' | 'orange' | 'red' | 'indigo' | 'slate';

/** How the frontend writes a number: pesos, a plain count, or a text that is already final. */
export type WidgetFormat = 'currency' | 'integer' | 'text';

/** The two cards at the top of the page. */
export type DashboardTab = 'general' | 'indicators';

/** Inclusive range of calendar days in Bogota, as YYYY-MM-DD. */
export interface DateRange {
  readonly from: string;
  readonly to: string;
}

/** The period the person chose, already translated to dates, with the one it is compared against. */
export interface PeriodWindow {
  readonly period: DashboardPeriod;
  /** "Hoy", "Ayer", "7 días", "Mes". */
  readonly label: string;
  readonly today: string;
  readonly current: DateRange;
  readonly previous: DateRange;
  /** How the comparison reads: "ayer", "los 7 días anteriores". */
  readonly previousLabel: string;
  /** Days of the sparkline, oldest first. */
  readonly seriesDays: readonly string[];
}

/** The big card at the top. One per page: the contribution with the highest priority wins. */
export interface HeroWidget {
  readonly key: string;
  readonly priority: number;
  readonly eyebrow: string;
  readonly title: string;
  readonly label: string;
  readonly value: number;
  readonly format: Exclude<WidgetFormat, 'text'>;
  /** Value of the comparison period, or null when it cannot be known. */
  readonly previous: number | null;
  /** One value per day of `window.seriesDays`; empty when there is no history to draw. */
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
  /** Name of an icon of the frontend library. */
  readonly icon: string;
  readonly tone: WidgetTone;
  readonly link: string | null;
  /** Same unit as `value`; null when the KPI is a snapshot without a comparison. */
  readonly previous: number | null;
}

export interface PanelStat {
  readonly key: string;
  readonly label: string;
  readonly value: number | string;
  readonly format: WidgetFormat;
  readonly meta: string | null;
  readonly icon: string;
  readonly tone: WidgetTone;
}

/** A tinted section with a grid of figures. */
export interface PanelWidget {
  readonly key: string;
  readonly order: number;
  readonly tab: DashboardTab;
  readonly title: string;
  readonly subtitle: string | null;
  readonly icon: string;
  readonly tone: WidgetTone;
  readonly link: string | null;
  readonly linkLabel: string | null;
  readonly stats: readonly PanelStat[];
}

export interface ListItem {
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  /** ISO 8601 date-time the item refers to. */
  readonly occurredAt: string | null;
  readonly badge: { readonly label: string; readonly tone: WidgetTone } | null;
}

export interface ListWidget {
  readonly key: string;
  readonly order: number;
  readonly tab: DashboardTab;
  readonly title: string;
  readonly subtitle: string | null;
  readonly icon: string;
  readonly tone: WidgetTone;
  readonly emptyText: string;
  readonly link: string | null;
  readonly linkLabel: string | null;
  readonly items: readonly ListItem[];
}

export interface TrendPoint {
  readonly label: string;
  readonly value: number;
}

/** A small bar chart: one value per label, oldest first. */
export interface TrendWidget {
  readonly key: string;
  readonly order: number;
  readonly tab: DashboardTab;
  readonly title: string;
  readonly subtitle: string | null;
  readonly format: Exclude<WidgetFormat, 'text'>;
  readonly tone: WidgetTone;
  readonly points: readonly TrendPoint[];
}

/** What one provider adds to the page. Every part is optional. */
export interface DashboardContribution {
  readonly hero?: HeroWidget;
  readonly kpis?: readonly KpiWidget[];
  readonly panels?: readonly PanelWidget[];
  readonly lists?: readonly ListWidget[];
  readonly trends?: readonly TrendWidget[];
}

export interface DashboardContext {
  readonly tenant: TenantContext;
  readonly window: PeriodWindow;
}

/**
 * Port that every area implements to put widgets on the dashboard. The dashboard module knows no area:
 * it finds the providers (classes decorated with @RegisterDashboardWidgets()), keeps those whose scope
 * and permissions match the request, runs them in parallel and merges what they return.
 */
export interface DashboardWidgetProvider {
  /** Unique name of the provider; also reported in `unavailable` when it fails. */
  readonly key: string;
  /** The user needs ALL of these permissions in the active scope. */
  readonly requiredPermissions: readonly string[];
  /** Scope kinds where the provider applies (the platform never reads tenant tables). */
  readonly scopeKinds: readonly ScopeKind[];
  provide(context: DashboardContext): Promise<DashboardContribution>;
}

export interface DashboardScopeInfo {
  readonly kind: ScopeKind;
  readonly label: string;
  readonly denominationName: string | null;
}

export interface DashboardSummary {
  readonly period: DashboardPeriod;
  readonly periodLabel: string;
  readonly previousLabel: string;
  /** Today in Bogota. */
  readonly asOf: string;
  readonly range: DateRange;
  readonly scope: DashboardScopeInfo;
  readonly hero: HeroWidget | null;
  readonly kpis: readonly KpiWidget[];
  readonly panels: readonly PanelWidget[];
  readonly lists: readonly ListWidget[];
  readonly trends: readonly TrendWidget[];
  /** Providers that failed: the page says some figures are missing instead of showing zeros. */
  readonly unavailable: readonly string[];
}
