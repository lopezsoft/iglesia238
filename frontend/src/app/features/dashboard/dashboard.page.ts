import { DatePipe, formatDate } from '@angular/common';
import { ChangeDetectionStrategy, Component, LOCALE_ID, computed, inject } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { Permission } from '../../core/auth/permission';
import { userMessage } from '../../core/errors/domain-error';
import { formatMoney } from '../../shared/pipes/money.pipe';
import { ErrorBannerComponent, LoadingComponent } from '../../shared/ui/feedback.components';
import { IconComponent, IconName } from '../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../shared/ui/page-header.component';
import { StatCardComponent } from '../../shared/ui/stat-card.component';
import { CashBookWidgetComponent } from './components/cash-book-widget.component';
import { CongregationsWidgetComponent } from './components/congregations-widget.component';
import { MonthlyIncomeWidgetComponent } from './components/monthly-income-widget.component';
import { PendingApplicationsWidgetComponent } from './components/pending-applications-widget.component';
import { QuickAccessComponent } from './components/quick-access.component';
import { RecentAuditWidgetComponent } from './components/recent-audit-widget.component';
import { RoleSummaryComponent } from './components/role-summary.component';
import { DashboardSummary } from './data/dashboard.models';
import { DashboardRepository } from './data/dashboard.repository';

export interface DashboardKpi {
  readonly key: string;
  readonly label: string;
  readonly value: string | number;
  readonly hint: string | null;
  readonly icon: IconName;
  readonly link: string;
}

interface HeaderAction {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  readonly permission: Permission;
}

/** Shortcuts of the page header, in priority order; the first two the role allows are shown. */
const HEADER_ACTIONS: readonly HeaderAction[] = [
  {
    label: 'Revisar solicitudes',
    path: '/applications',
    icon: 'inbox',
    permission: 'applications.review',
  },
  {
    label: 'Emitir certificado',
    path: '/certificates',
    icon: 'certificate',
    permission: 'certificates.issue',
  },
  {
    label: 'Registrar aporte',
    path: '/accounting/contributions',
    icon: 'coins',
    permission: 'contributions.write',
  },
  {
    label: 'Registrar asistencia',
    path: '/attendance',
    icon: 'calendar-check',
    permission: 'attendance.write',
  },
  {
    label: 'Administrar sedes',
    path: '/organization',
    icon: 'building',
    permission: 'congregations.manage',
  },
  {
    label: 'Denominaciones',
    path: '/denominations',
    icon: 'landmark',
    permission: 'denominations.manage',
  },
  { label: 'Usuarios y roles', path: '/users', icon: 'users', permission: 'users.manage' },
];
const MAX_HEADER_ACTIONS = 2;

/** E-01 Inicio: greeting, KPIs and widgets chosen by the permissions of the active scope. */
@Component({
  selector: 'app-dashboard-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CashBookWidgetComponent,
    CongregationsWidgetComponent,
    DatePipe,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    MonthlyIncomeWidgetComponent,
    PageHeaderComponent,
    PendingApplicationsWidgetComponent,
    QuickAccessComponent,
    RecentAuditWidgetComponent,
    RoleSummaryComponent,
    RouterLink,
    StatCardComponent,
  ],
  templateUrl: './dashboard.page.html',
  styleUrl: './dashboard.page.scss',
})
export class DashboardPage {
  private readonly repository = inject(DashboardRepository);
  protected readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);
  private readonly now = new Date();

  protected readonly summary = rxResource({
    params: () => ({ scope: this.auth.activeScope(), permissions: this.auth.permissions() }),
    stream: () => this.repository.summary(),
  });

  /** Summary once loaded; `value()` throws while the resource is in the error state. */
  protected readonly data = computed(() =>
    this.summary.hasValue() ? this.summary.value() : undefined,
  );

  protected readonly loadError = computed(() => {
    const error = this.summary.error();
    return error ? userMessage(error) : null;
  });

  protected readonly scopeLabel = computed(() => this.auth.activeScope()?.label ?? '');

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
    HEADER_ACTIONS.filter((action) => this.auth.can(action.permission)).slice(
      0,
      MAX_HEADER_ACTIONS,
    ),
  );

  protected readonly kpis = computed(() => {
    const summary = this.data();
    return summary ? buildKpis(summary, this.scopeLabel(), this.locale) : [];
  });
}

/** "Pastor Daniel Herrera" → "Pastor Daniel"; "Laura Gómez" → "Laura". */
export function shortName(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.slice(0, -1).join(' ') : (words[0] ?? '');
}

/** KPI cards of the widgets present in the summary, in reading order. */
export function buildKpis(
  summary: DashboardSummary,
  scopeLabel: string,
  locale: string,
): DashboardKpi[] {
  const kpis: DashboardKpi[] = [];
  const date = (iso: string): string => formatDate(iso, 'dd/MM/yyyy', locale);
  if (summary.denominations) {
    kpis.push({
      key: 'denominations',
      label: 'Denominaciones activas',
      value: summary.denominations.active,
      hint: `${summary.denominations.inactive} inactivas`,
      icon: 'landmark',
      link: '/denominations',
    });
  }
  if (summary.users) {
    kpis.push({
      key: 'users',
      label: 'Usuarios activos',
      value: summary.users.active,
      hint: `${summary.users.pendingInvitations} invitaciones pendientes`,
      icon: 'users',
      link: '/users',
    });
  }
  if (summary.membership) {
    kpis.push(
      {
        key: 'members',
        label: 'Miembros activos',
        value: summary.membership.active,
        hint: scopeLabel,
        icon: 'id-card',
        link: '/members',
      },
      {
        key: 'new-members',
        label: `Nuevos miembros en ${summary.membership.year}`,
        value: summary.membership.newThisYear,
        hint: 'Según la fecha de ingreso',
        icon: 'user',
        link: '/members',
      },
    );
  }
  if (summary.pendingApplications) {
    kpis.push({
      key: 'applications',
      label: 'Solicitudes pendientes',
      value: summary.pendingApplications.total,
      hint: 'Pendientes y en revisión',
      icon: 'inbox',
      link: '/applications',
    });
  }
  if (summary.certificates) {
    kpis.push({
      key: 'certificates',
      label: `Certificados emitidos en ${summary.certificates.year}`,
      value: summary.certificates.issuedThisYear,
      hint: summary.certificates.lastNumber
        ? `Último: ${summary.certificates.lastNumber}`
        : 'Aún no hay certificados',
      icon: 'certificate',
      link: '/certificates',
    });
  }
  if (summary.attendance) {
    const session = summary.attendance.lastSession;
    kpis.push({
      key: 'attendance',
      label: 'Última asistencia registrada',
      value: session ? session.total : '—',
      hint: session
        ? `${session.meetingTypeName} · ${date(session.sessionDate)}`
        : 'Aún no hay sesiones',
      icon: 'calendar-check',
      link: '/attendance',
    });
  }
  if (summary.monthlyIncome) {
    kpis.push({
      key: 'income',
      label: `Aportes de ${summary.monthlyIncome.monthLabel.toLowerCase()}`,
      value: formatMoney(summary.monthlyIncome.total),
      hint: 'Diezmos, ofrendas, primicias y votos',
      icon: 'coins',
      link: '/accounting/contributions',
    });
  }
  if (summary.cashBook) {
    kpis.push({
      key: 'cash',
      label: 'Saldo en fondos',
      value: formatMoney(summary.cashBook.totalBalance),
      hint: summary.cashBook.openPeriodLabel
        ? `Periodo abierto: ${summary.cashBook.openPeriodLabel}`
        : null,
      icon: 'wallet',
      link: '/accounting/cash-book',
    });
  }
  if (summary.titheSettlement) {
    const { daysSince, lastSettledOn } = summary.titheSettlement;
    kpis.push({
      key: 'tithe',
      label: 'Días desde la última liquidación',
      value: daysSince ?? '—',
      hint: lastSettledOn ? `Última: ${date(lastSettledOn)}` : 'Aún no hay liquidaciones',
      icon: 'percent',
      link: '/accounting/tithe-settlements',
    });
  }
  return kpis;
}
