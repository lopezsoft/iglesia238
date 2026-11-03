import { NgTemplateOutlet, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Permission } from '../../core/auth/permission';
import { userMessage } from '../../core/errors/domain-error';
import { FileDownloadService } from '../../shared/utils/file-download.service';
import { ErrorBannerComponent, EmptyStateComponent } from '../../shared/ui/feedback.components';
import { ExportActionsComponent } from '../../shared/ui/export-actions.component';
import { HeroCardComponent } from '../../shared/ui/hero-card.component';
import { IconComponent, IconName } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { SegmentedControlComponent } from '../../shared/ui/segmented-control.component';
import { SkeletonComponent } from '../../shared/ui/skeleton.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { TabCardItem, TabCardsComponent } from '../../shared/ui/tab-cards.component';
import { QuickAccessComponent } from './components/quick-access.component';
import { WidgetListComponent } from './components/widget-list.component';
import { WidgetPanelComponent } from './components/widget-panel.component';
import { WidgetTrendComponent } from './components/widget-trend.component';
import { buildDashboardCsv, dashboardCsvFilename } from './data/dashboard-export';
import {
  DEFAULT_PERIOD,
  DashboardPeriod,
  DashboardSummary,
  DashboardTab,
  KpiWidget,
  PERIOD_OPTIONS,
  isDashboardPeriod,
} from './data/dashboard.models';
import { DashboardRepository } from './data/dashboard.repository';
import { compareWithPrevious, describeRange, formatWidgetValue } from './data/widget-format';
import { widgetIcon } from './data/widget-icons';

interface HeaderAction {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  readonly permission: Permission;
}

/** Shortcuts of the page header, in priority order; the first two the role allows are shown. */
const HEADER_ACTIONS: readonly HeaderAction[] = [
  { label: 'Revisar solicitudes', path: '/applications', icon: 'inbox', permission: 'applications.review' },
  { label: 'Emitir certificado', path: '/certificates', icon: 'certificate', permission: 'certificates.issue' },
  { label: 'Registrar aporte', path: '/accounting/contributions', icon: 'coins', permission: 'contributions.write' },
  { label: 'Registrar asistencia', path: '/attendance', icon: 'calendar-check', permission: 'attendance.write' },
  { label: 'Administrar sedes', path: '/organization', icon: 'building', permission: 'congregations.manage' },
  { label: 'Denominaciones', path: '/denominations', icon: 'landmark', permission: 'denominations.manage' },
  { label: 'Usuarios y roles', path: '/users', icon: 'users', permission: 'users.manage' },
];
const MAX_HEADER_ACTIONS = 2;

const TABS: readonly TabCardItem<DashboardTab>[] = [
  { id: 'general', title: 'General', subtitle: 'Resumen del periodo', icon: 'layout-grid' },
  { id: 'indicators', title: 'Indicadores', subtitle: 'Tendencias y seguridad', icon: 'bar-chart' },
];

export interface KpiView {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly hint: string | null;
  readonly icon: IconName;
  readonly tone: KpiWidget['tone'];
  readonly link: string | null;
  readonly comparison: string | null;
  readonly compareLabel: string | null;
  readonly compareValue: string | null;
}

/** E-01 Inicio: hero, KPI, panels, lists and trends that the API assembles for the role and scope. */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    EmptyStateComponent,
    ErrorBannerComponent,
    ExportActionsComponent,
    HeroCardComponent,
    IconComponent,
    NgTemplateOutlet,
    PageHeaderComponent,
    QuickAccessComponent,
    RouterLink,
    SegmentedControlComponent,
    SkeletonComponent,
    StatCardComponent,
    TabCardsComponent,
    WidgetListComponent,
    WidgetPanelComponent,
    WidgetTrendComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly repository = inject(DashboardRepository);
  private readonly downloads = inject(FileDownloadService);
  protected readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);
  private readonly now = new Date();

  protected readonly tabs = TABS;
  protected readonly periods = PERIOD_OPTIONS;
  protected readonly period = signal<DashboardPeriod>(DEFAULT_PERIOD);
  protected readonly tab = signal<DashboardTab>('general');

  protected readonly summary = rxResource({
    params: () => ({
      scope: this.auth.activeScope(),
      permissions: this.auth.permissions(),
      period: this.period(),
    }),
    stream: ({ params }) => this.repository.summary(params.period),
  });

  /**
   * Last summary loaded for the active scope. It stays on screen while another period loads, but is
   * dropped when the scope changes (figures of another sede must never linger).
   */
  protected readonly data = linkedSignal<
    { value: DashboardSummary | undefined; scope: unknown },
    DashboardSummary | undefined
  >({
    source: () => ({
      value: this.summary.hasValue() ? this.summary.value() : undefined,
      scope: this.auth.activeScope(),
    }),
    computation: (next, previous) =>
      next.value ?? (previous && previous.source.scope === next.scope ? previous.value : undefined),
  });

  protected readonly refreshing = computed(() => this.summary.isLoading() && this.data() !== undefined);

  protected readonly loadError = computed(() => {
    const error = this.summary.error();
    return error ? userMessage(error) : null;
  });

  protected readonly greeting = computed(() => {
    const hour = this.now.getHours();
    const salutation = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';
    const name = shortName(this.auth.user()?.displayName ?? '');
    return name ? `${salutation}, ${name}` : salutation;
  });

  protected readonly subtitle = computed(() => {
    const today = formatDate(this.now, "EEEE, d 'de' MMMM 'de' y", this.locale);
    const scope = this.auth.activeScope();
    const target = scope?.kind === 'PLATFORM' ? 'la plataforma' : (scope?.label ?? '');
    return `${today.charAt(0).toUpperCase()}${today.slice(1)} · Resumen de ${target}`;
  });

  protected readonly headerActions = computed(() =>
    HEADER_ACTIONS.filter((action) => this.auth.can(action.permission)).slice(0, MAX_HEADER_ACTIONS),
  );

  protected readonly hero = computed(() => {
    const summary = this.data();
    if (!summary?.hero) {
      return null;
    }
    const { hero } = summary;
    return {
      title: hero.title,
      eyebrow: hero.eyebrow,
      label: hero.label,
      value: formatWidgetValue(hero.value, hero.format),
      comparison: compareWithPrevious(hero.value, hero.previous),
      compareLabel:
        hero.previous === null
          ? null
          : `vs. ${summary.previousLabel} · ${formatWidgetValue(hero.previous, hero.format)}`,
      date: describeRange(summary.range),
      series: hero.series,
    };
  });

  protected readonly general = computed(() => this.slice('general'));
  protected readonly indicators = computed(() => this.slice('indicators'));

  /** Nothing to show in General: no hero, KPI, panel or list (an area with figures has not been added yet). */
  protected readonly isGeneralEmpty = computed(() => {
    const general = this.general();
    return !this.hero() && !general.kpis.length && !general.panels.length && !general.lists.length;
  });

  protected reload(): void {
    this.summary.reload();
  }

  protected setPeriod(value: string): void {
    if (isDashboardPeriod(value)) {
      this.period.set(value);
    }
  }

  protected setTab(value: string): void {
    if (value === 'general' || value === 'indicators') {
      this.tab.set(value);
    }
  }

  protected exportCsv(): void {
    const summary = this.data();
    if (summary) {
      this.downloads.save(
        new Blob([buildDashboardCsv(summary)], { type: 'text/csv;charset=utf-8' }),
        dashboardCsvFilename(summary),
      );
    }
  }

  private slice(tab: DashboardTab) {
    const summary = this.data();
    return {
      kpis: (summary?.kpis ?? []).filter((kpi) => kpi.tab === tab).map((kpi) => toKpiView(kpi, summary)),
      panels: (summary?.panels ?? []).filter((panel) => panel.tab === tab),
      lists: (summary?.lists ?? []).filter((list) => list.tab === tab),
      trends: (summary?.trends ?? []).filter((trend) => trend.tab === tab),
    };
  }
}

function toKpiView(kpi: KpiWidget, summary: DashboardSummary | undefined): KpiView {
  const hasComparison = kpi.previous !== null && typeof kpi.value === 'number';
  return {
    key: kpi.key,
    label: kpi.label,
    value: formatWidgetValue(kpi.value, kpi.format),
    hint: kpi.hint,
    icon: widgetIcon(kpi.icon),
    tone: kpi.tone,
    link: kpi.link,
    comparison: hasComparison ? compareWithPrevious(kpi.value as number, kpi.previous).text : null,
    compareLabel: hasComparison ? `vs. ${summary?.previousLabel ?? 'antes'}` : null,
    compareValue: hasComparison ? formatWidgetValue(kpi.previous as number, kpi.format) : null,
  };
}

/** "Pastor Daniel Herrera" → "Pastor Daniel"; "Laura Gómez" → "Laura". */
export function shortName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.slice(0, -1).join(' ') : (words[0] ?? '');
}
