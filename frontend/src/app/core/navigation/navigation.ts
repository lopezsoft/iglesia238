import { Permission } from '../auth/permission';
import { IconName } from '../../shared/ui/icon.component';

/**
 * Permission required by each module: the single source for the route guards and the menu.
 * Any one of the listed permissions grants access; write actions inside a module check their
 * own permission (for example contributions.write inside Aportes).
 */
export const ACCESS = {
  denominations: ['denominations.manage'],
  organization: ['congregations.manage'],
  users: ['users.manage'],
  applications: ['applications.review'],
  members: ['members.read'],
  certificates: ['certificates.issue'],
  attendance: ['attendance.write'],
  secretariatRecords: ['members.write'],
  contributions: ['contributions.read'],
  vows: ['contributions.read'],
  cashBook: ['cash-transactions.write'],
  titheSettlements: ['tithe-settlements.write'],
  budget: ['budgets.manage'],
  accountingSetup: ['budgets.manage'],
  reports: ['reports.read'],
  audit: ['audit-logs.read'],
} as const satisfies Record<string, readonly Permission[]>;

export interface NavItem {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  /** Empty: every signed-in user. */
  readonly permissions: readonly Permission[];
}

export interface NavGroup {
  readonly label: string;
  readonly items: readonly NavItem[];
}

export const NAV_GROUPS: readonly NavGroup[] = [
  { label: 'General', items: [{ label: 'Inicio', path: '/dashboard', icon: 'home', permissions: [] }] },
  {
    label: 'Plataforma',
    items: [{ label: 'Denominaciones', path: '/denominations', icon: 'landmark', permissions: ACCESS.denominations }],
  },
  {
    label: 'Organización',
    items: [
      { label: 'Sedes y razones sociales', path: '/organization', icon: 'building', permissions: ACCESS.organization },
      { label: 'Usuarios y roles', path: '/users', icon: 'users', permissions: ACCESS.users },
    ],
  },
  {
    label: 'Membresía',
    items: [
      { label: 'Solicitudes', path: '/applications', icon: 'inbox', permissions: ACCESS.applications },
      { label: 'Miembros', path: '/members', icon: 'id-card', permissions: ACCESS.members },
    ],
  },
  {
    label: 'Secretaría',
    items: [
      { label: 'Certificados y carnés', path: '/certificates', icon: 'certificate', permissions: ACCESS.certificates },
      { label: 'Asistencia', path: '/attendance', icon: 'calendar-check', permissions: ACCESS.attendance },
      { label: 'Registros de secretaría', path: '/secretariat-records', icon: 'book', permissions: ACCESS.secretariatRecords },
    ],
  },
  {
    label: 'Contabilidad',
    items: [
      { label: 'Aportes', path: '/accounting/contributions', icon: 'coins', permissions: ACCESS.contributions },
      { label: 'Votos', path: '/accounting/vows', icon: 'gift', permissions: ACCESS.vows },
      { label: 'Libro de caja', path: '/accounting/cash-book', icon: 'wallet', permissions: ACCESS.cashBook },
      { label: 'Liquidación del diezmo', path: '/accounting/tithe-settlements', icon: 'percent', permissions: ACCESS.titheSettlements },
      { label: 'Presupuesto', path: '/accounting/budget', icon: 'pie-chart', permissions: ACCESS.budget },
      { label: 'Configuración contable', path: '/accounting/setup', icon: 'sliders', permissions: ACCESS.accountingSetup },
    ],
  },
  {
    label: 'Control',
    items: [
      { label: 'Reportes', path: '/reports', icon: 'bar-chart', permissions: ACCESS.reports },
      { label: 'Auditoría', path: '/audit', icon: 'shield', permissions: ACCESS.audit },
    ],
  },
];

/** Groups with only the items `canAny` allows; empty groups are dropped. */
export function visibleNavGroups(canAny: (permissions: readonly Permission[]) => boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => canAny(item.permissions)),
  })).filter((group) => group.items.length > 0);
}
