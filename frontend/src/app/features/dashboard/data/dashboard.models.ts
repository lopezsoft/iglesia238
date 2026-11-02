// Dashboard (E-01 Inicio) view models. Every widget is null when the active role cannot read
// it: the API (and the demo adapter) never sends data the permissions of the scope do not grant.
import { ApplicationStatus } from '../../../core/models/membership.model';

/** denominations.manage (platform scope). */
export interface DenominationsOverview {
  readonly active: number;
  readonly inactive: number;
}

/** users.manage: users of the platform or of the denomination (or sede) in scope. */
export interface UsersOverview {
  readonly active: number;
  readonly pendingInvitations: number;
}

/** audit-logs.read: newest entries of the scope, without personal data. */
export interface AuditHighlight {
  readonly id: number;
  readonly createdAt: string;
  readonly userName: string;
  readonly actionLabel: string;
  readonly entityLabel: string;
  readonly scopeLabel: string;
}

/** congregations.manage: one row per sede in scope. */
export interface CongregationOverview {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
  readonly activeMembers: number;
  readonly pendingApplications: number;
}

export interface PendingApplicationItem {
  readonly id: number;
  readonly fullName: string;
  readonly initials: string;
  readonly congregationName: string;
  readonly status: ApplicationStatus;
  readonly createdAt: string;
  /** "Menor con acudiente", "Viene de Sede Norte"… never a document number. */
  readonly note: string | null;
}

/** applications.review: newest unresolved applications. */
export interface PendingApplicationsOverview {
  readonly total: number;
  readonly items: readonly PendingApplicationItem[];
}

/** members.read. */
export interface MembershipOverview {
  readonly year: number;
  readonly active: number;
  readonly newThisYear: number;
}

/** certificates.issue. */
export interface CertificatesOverview {
  readonly year: number;
  readonly issuedThisYear: number;
  readonly lastNumber: string | null;
}

export interface AttendanceSessionSummary {
  readonly sessionDate: string;
  readonly meetingTypeName: string;
  readonly congregationName: string;
  readonly total: number;
}

/** attendance.write. */
export interface AttendanceOverview {
  /** Null when the scope has no session recorded yet. */
  readonly lastSession: AttendanceSessionSummary | null;
}

export interface CategoryAmount {
  readonly label: string;
  readonly amount: number;
}

export interface MonthTotal {
  readonly year: number;
  readonly month: number;
  /** "Noviembre 2026". */
  readonly label: string;
  /** "Nov". */
  readonly shortLabel: string;
  readonly total: number;
}

/** contributions.read: non-voided contributions of the scope. */
export interface MonthlyIncomeOverview {
  readonly monthLabel: string;
  readonly total: number;
  readonly byCategory: readonly CategoryAmount[];
  /** Last six months, oldest first; the last one is the current month. */
  readonly trend: readonly MonthTotal[];
}

export interface FundBalanceItem {
  readonly fundId: number;
  readonly name: string;
  readonly balance: number;
}

/** cash-transactions.write. */
export interface CashBookOverview {
  /** "Noviembre 2026"; null when no period is open (or the scope spans several sedes). */
  readonly openPeriodLabel: string | null;
  readonly funds: readonly FundBalanceItem[];
  readonly totalBalance: number;
}

/** tithe-settlements.write. */
export interface TitheSettlementOverview {
  readonly lastSettledOn: string | null;
  readonly daysSince: number | null;
}

export interface DashboardSummary {
  /** Date the figures refer to (YYYY-MM-DD). */
  readonly asOf: string;
  /** Denomination of the scope; null on the platform scope. */
  readonly denominationName: string | null;
  readonly denominations: DenominationsOverview | null;
  readonly users: UsersOverview | null;
  readonly recentAudit: readonly AuditHighlight[] | null;
  readonly congregations: readonly CongregationOverview[] | null;
  readonly pendingApplications: PendingApplicationsOverview | null;
  readonly membership: MembershipOverview | null;
  readonly certificates: CertificatesOverview | null;
  readonly attendance: AttendanceOverview | null;
  readonly monthlyIncome: MonthlyIncomeOverview | null;
  readonly cashBook: CashBookOverview | null;
  readonly titheSettlement: TitheSettlementOverview | null;
}

export const PENDING_APPLICATIONS_LIMIT = 5;
export const RECENT_AUDIT_LIMIT = 5;
export const INCOME_TREND_MONTHS = 6;

/** One-line description of each module for the quick-access grid, by route path. */
export const MODULE_DESCRIPTIONS: Readonly<Record<string, string>> = {
  '/denominations': 'Alta, logo y estado de cada denominación',
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
