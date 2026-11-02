import { Injectable, Injector, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Permission } from '../../../core/auth/permission';
import { DemoDatabase } from '../../../core/demo/demo-database';
import { demoCommand } from '../../../core/demo/demo-request';
import { DomainError } from '../../../core/errors/domain-error';
import { MEETING_TYPES, catalogName } from '../../../core/models/catalogs';
import { AuditLogEntry } from '../../../core/models/identity.model';
import { ApplicationStatus, MembershipApplication } from '../../../core/models/membership.model';
import { ACCOUNTING_DEMO_TODAY } from '../../accounting/data/accounting-demo-seed';
import { AccountingDemoStore } from '../../accounting/data/accounting-demo-store';
import { YearMonth, monthLabel, yearMonthOf } from '../../accounting/data/accounting-rules';
import {
  CONTRIBUTION_CATEGORIES,
  CONTRIBUTION_CATEGORY_PLURALS,
  ContributionCategory,
  MONTH_NAMES,
} from '../../accounting/data/accounting.models';
import { auditActionLabel, auditEntityLabel } from '../../audit/audit-log/data/audit-log.models';
import { AttendanceDemoStore } from '../../secretariat/attendance/data/attendance-demo-store';
import { coveredSedes } from '../../reports/data/report-sedes';
import { sessionTotal } from '../../secretariat/attendance/data/attendance.models';
import { certificateNumber } from '../../secretariat/certificates/data/certificate-document';
import { CertificatesDemoStore } from '../../secretariat/certificates/data/certificates-demo-store';
import {
  AttendanceOverview,
  AuditHighlight,
  CashBookOverview,
  CertificatesOverview,
  CongregationOverview,
  DashboardSummary,
  DenominationsOverview,
  INCOME_TREND_MONTHS,
  MembershipOverview,
  MonthTotal,
  MonthlyIncomeOverview,
  PENDING_APPLICATIONS_LIMIT,
  PendingApplicationsOverview,
  RECENT_AUDIT_LIMIT,
  TitheSettlementOverview,
  UsersOverview,
} from './dashboard.models';
import { DashboardRepository } from './dashboard.repository';

const UNRESOLVED: readonly ApplicationStatus[] = ['PENDING', 'IN_REVIEW'];
const DAY_MS = 86_400_000;

/** Tenant of a denomination (or sede) scope. */
interface Tenant {
  readonly denominationId: number;
  readonly congregationId: number | null;
}

interface ScopedRow {
  readonly denominationId: number;
  readonly congregationId: number;
}

/**
 * Demo adapter: computes each widget from the shared demo tables only when the permissions of
 * the active scope allow it, with the tenant isolation of the API. Feature stores are resolved
 * lazily so a user without accounting or secretariat permissions never touches them.
 */
@Injectable()
export class DemoDashboardRepository extends DashboardRepository {
  private readonly db = inject(DemoDatabase);
  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);

  summary(): Observable<DashboardSummary> {
    return demoCommand(() => {
      if (!this.auth.user() || !this.auth.activeScope()) {
        throw new DomainError('UNAUTHENTICATED', 'Inicia sesión para ver el resumen.');
      }
      const { denominationId, congregationId } = this.auth.tenant();
      const tenant: Tenant | null =
        denominationId === null ? null : { denominationId, congregationId };
      const asOf = ACCOUNTING_DEMO_TODAY;
      const can = (permission: Permission): boolean => this.auth.can(permission);

      return {
        asOf,
        denominationName: tenant
          ? (this.db.denominations.find((d) => d.id === tenant.denominationId)?.name ?? null)
          : null,
        denominations: can('denominations.manage') && tenant === null ? this.denominations() : null,
        users: can('users.manage') ? this.users(tenant) : null,
        recentAudit: can('audit-logs.read') ? this.recentAudit(tenant) : null,
        congregations: can('congregations.manage') && tenant ? this.congregations(tenant) : null,
        pendingApplications:
          can('applications.review') && tenant ? this.pendingApplications(tenant) : null,
        membership: can('members.read') && tenant ? this.membership(tenant, asOf) : null,
        certificates: can('certificates.issue') && tenant ? this.certificates(tenant, asOf) : null,
        attendance: can('attendance.write') && tenant ? this.attendance(tenant) : null,
        monthlyIncome:
          can('contributions.read') && tenant ? this.monthlyIncome(tenant, asOf) : null,
        cashBook: can('cash-transactions.write') && tenant ? this.cashBook(tenant, asOf) : null,
        titheSettlement:
          can('tithe-settlements.write') && tenant ? this.titheSettlement(tenant, asOf) : null,
      };
    });
  }

  // --- Platform and organization -------------------------------------------------------------

  private denominations(): DenominationsOverview {
    const active = this.db.denominations.filter((d) => d.isActive).length;
    return { active, inactive: this.db.denominations.length - active };
  }

  /** Platform scope: every user. Otherwise users with a current role that covers the scope. */
  private users(tenant: Tenant | null): UsersOverview {
    const users =
      tenant === null
        ? this.db.users
        : this.db.users.filter((user) =>
            this.db.userRoles.some(
              (role) =>
                role.userId === user.id &&
                role.revokedAt === null &&
                role.denominationId === tenant.denominationId &&
                (tenant.congregationId === null ||
                  role.congregationId === null ||
                  role.congregationId === tenant.congregationId),
            ),
          );
    return {
      active: users.filter((user) => user.isActive && !user.invitationPending).length,
      pendingInvitations: users.filter((user) => user.invitationPending).length,
    };
  }

  private recentAudit(tenant: Tenant | null): AuditHighlight[] {
    const entries =
      tenant === null
        ? this.auth.activeRoles().includes('PLATFORM_ADMIN')
          ? this.db.auditLogs
          : []
        : this.db.auditLogs.filter(
            (entry) =>
              entry.denominationId === tenant.denominationId &&
              (tenant.congregationId === null || entry.congregationId === tenant.congregationId),
          );
    return [...entries]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id)
      .slice(0, RECENT_AUDIT_LIMIT)
      .map((entry) => ({
        id: entry.id,
        createdAt: entry.createdAt,
        userName:
          entry.userId === null
            ? 'Sistema'
            : (this.db.users.find((u) => u.id === entry.userId)?.displayName ?? 'Usuario'),
        actionLabel: auditActionLabel(entry.action),
        entityLabel: auditEntityLabel(entry.entity),
        scopeLabel: this.auditScopeLabel(entry),
      }));
  }

  private auditScopeLabel(entry: AuditLogEntry): string {
    if (entry.congregationId !== null) {
      return this.db.congregation(entry.congregationId)?.name ?? 'Sede';
    }
    if (entry.denominationId !== null) {
      return (
        this.db.denominations.find((d) => d.id === entry.denominationId)?.name ?? 'Denominación'
      );
    }
    return 'Plataforma';
  }

  private congregations(tenant: Tenant): CongregationOverview[] {
    return this.db.congregations
      .filter(
        (c) =>
          c.denominationId === tenant.denominationId &&
          (tenant.congregationId === null || c.id === tenant.congregationId),
      )
      .map((c) => ({
        id: c.id,
        name: c.name,
        isActive: c.isActive,
        activeMembers: this.db.members.filter(
          (m) => m.congregationId === c.id && m.status === 'ACTIVE',
        ).length,
        pendingApplications: this.db.membershipApplications.filter(
          (a) => a.congregationId === c.id && UNRESOLVED.includes(a.status),
        ).length,
      }));
  }

  // --- Membership and secretariat ------------------------------------------------------------

  private pendingApplications(tenant: Tenant): PendingApplicationsOverview {
    const unresolved = this.db.membershipApplications
      .filter((a) => inScope(tenant, a) && UNRESOLVED.includes(a.status))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      total: unresolved.length,
      items: unresolved.slice(0, PENDING_APPLICATIONS_LIMIT).map((a) => ({
        id: a.id,
        fullName: `${a.firstName} ${a.lastName}`,
        initials: initialsOf(a.firstName, a.lastName),
        congregationName: this.db.congregation(a.congregationId)?.name ?? '—',
        status: a.status,
        createdAt: a.createdAt,
        note: applicationNote(a),
      })),
    };
  }

  private membership(tenant: Tenant, asOf: string): MembershipOverview {
    const year = yearMonthOf(asOf).year;
    const members = this.db.members.filter((m) => inScope(tenant, m));
    return {
      year,
      active: members.filter((m) => m.status === 'ACTIVE').length,
      newThisYear: members.filter((m) => m.joinedOn?.startsWith(`${year}-`)).length,
    };
  }

  private certificates(tenant: Tenant, asOf: string): CertificatesOverview {
    const store = this.injector.get(CertificatesDemoStore);
    const year = yearMonthOf(asOf).year;
    const issued = store.certificates
      .filter((c) => inScope(tenant, c) && c.voidedAt === null && c.issuedOn.startsWith(`${year}-`))
      .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id - a.id);
    const last = issued[0];
    const lastType = last
      ? store.certificateTypes.find((t) => t.id === last.certificateTypeId)
      : undefined;
    return {
      year,
      issuedThisYear: issued.length,
      lastNumber:
        last && lastType ? certificateNumber(lastType.code, year, last.sequenceNumber) : null,
    };
  }

  private attendance(tenant: Tenant): AttendanceOverview {
    const last = this.injector
      .get(AttendanceDemoStore)
      .sessions.filter((s) => inScope(tenant, s))
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.id - a.id)[0];
    return {
      lastSession: last
        ? {
            sessionDate: last.sessionDate,
            meetingTypeName: catalogName(MEETING_TYPES, last.meetingTypeCode),
            congregationName: this.db.congregation(last.congregationId)?.name ?? '—',
            total: sessionTotal(last),
          }
        : null,
    };
  }

  // --- Accounting --------------------------------------------------------------------------------

  private monthlyIncome(tenant: Tenant, asOf: string): MonthlyIncomeOverview {
    const store = this.injector.get(AccountingDemoStore);
    const current = yearMonthOf(asOf);
    const recorded = store.contributions.filter(
      (c) => inScope(tenant, c) && c.status === 'RECORDED',
    );
    const inMonth = (date: string, { year, month }: YearMonth): boolean =>
      date.startsWith(`${year}-${String(month).padStart(2, '0')}-`);

    const byCategory = new Map<ContributionCategory, number>();
    for (const contribution of recorded.filter((c) => inMonth(c.receivedOn, current))) {
      const category =
        store.contributionType(tenant.denominationId, contribution.contributionTypeId)?.category ??
        'OTHER';
      byCategory.set(category, (byCategory.get(category) ?? 0) + contribution.amount);
    }

    const trend: MonthTotal[] = lastMonths(current, INCOME_TREND_MONTHS).map((ym) => ({
      ...ym,
      label: monthLabel(ym),
      shortLabel: shortMonth(ym.month),
      total: recorded
        .filter((c) => inMonth(c.receivedOn, ym))
        .reduce((sum, c) => sum + c.amount, 0),
    }));

    return {
      monthLabel: monthLabel(current),
      total: [...byCategory.values()].reduce((sum, amount) => sum + amount, 0),
      byCategory: CONTRIBUTION_CATEGORIES.filter((category) => byCategory.has(category)).map(
        (category) => ({
          label: CONTRIBUTION_CATEGORY_PLURALS[category],
          amount: byCategory.get(category) ?? 0,
        }),
      ),
      trend,
    };
  }

  private cashBook(tenant: Tenant, asOf: string): CashBookOverview {
    const store = this.injector.get(AccountingDemoStore);
    const current = yearMonthOf(asOf);
    // Same sede set as the reports: a deactivated sede keeps counting while it holds money.
    const sedes =
      tenant.congregationId === null
        ? coveredSedes(
            store.congregationIdsOf(tenant.denominationId),
            store.fundOpeningBalances.filter((b) => inScope(tenant, b)),
            store.cashTransactions.filter((tx) => inScope(tenant, tx)),
          ).map((sede) => sede.id)
        : [tenant.congregationId];
    const funds = store.funds
      .filter((fund) => fund.denominationId === tenant.denominationId)
      .map((fund) => ({
        fundId: fund.id,
        name: fund.name,
        isActive: fund.isActive,
        balance: sedes.reduce(
          (sum, sede) => sum + store.fundBalance(sede, fund.id, current).closing,
          0,
        ),
      }))
      .filter((fund) => fund.isActive || fund.balance !== 0)
      .map(({ fundId, name, balance }) => ({ fundId, name, balance }));

    const openPeriod =
      tenant.congregationId === null
        ? undefined
        : store
            .periodsOf(tenant.congregationId)
            .filter((p) => p.status === 'OPEN')
            .sort((a, b) => a.year - b.year || a.month - b.month)[0];

    return {
      openPeriodLabel: openPeriod ? monthLabel(openPeriod) : null,
      funds,
      totalBalance: funds.reduce((sum, fund) => sum + fund.balance, 0),
    };
  }

  private titheSettlement(tenant: Tenant, asOf: string): TitheSettlementOverview {
    const last = this.injector
      .get(AccountingDemoStore)
      .titheSettlements.filter((s) => inScope(tenant, s) && s.status === 'ISSUED')
      .sort((a, b) => b.settledOn.localeCompare(a.settledOn))[0];
    return {
      lastSettledOn: last?.settledOn ?? null,
      daysSince: last ? daysBetween(last.settledOn, asOf) : null,
    };
  }
}

function inScope(tenant: Tenant, row: ScopedRow): boolean {
  return (
    row.denominationId === tenant.denominationId &&
    (tenant.congregationId === null || row.congregationId === tenant.congregationId)
  );
}

function initialsOf(firstName: string, lastName: string): string {
  return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
}

function applicationNote(application: MembershipApplication): string | null {
  if (application.guardianName) {
    return 'Menor con acudiente';
  }
  if (application.formData.previousCongregationName) {
    return `Viene de ${application.formData.previousCongregationName}`;
  }
  return null;
}

/** The `count` months ending in `last`, oldest first. */
function lastMonths(last: YearMonth, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, index) => {
    const offset = last.year * 12 + (last.month - 1) - (count - 1 - index);
    return { year: Math.floor(offset / 12), month: (offset % 12) + 1 };
  });
}

function shortMonth(month: number): string {
  const name = MONTH_NAMES[month - 1] ?? '';
  return `${name.charAt(0).toUpperCase()}${name.slice(1, 3)}`;
}

/** Whole days from one ISO date to another. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);
}
