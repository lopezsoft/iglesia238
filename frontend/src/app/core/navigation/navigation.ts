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
  privacyPolicy: ['congregations.manage'],
  users: ['users.manage'],
  applications: ['applications.review'],
  members: ['members.read'],
  // The treasury only gets the donations certificate: the module narrows what it shows.
  certificates: ['certificates.issue', 'donation-certificates.issue'],
  certificateTemplates: ['certificate-types.manage'],
  branding: ['branding.manage'],
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
  /** Label under the icon of the 76 px rail; the full `label` is the tooltip and the drawer text. */
  readonly shortLabel: string;
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
  { label: 'General', items: [{ label: 'Inicio', shortLabel: 'Inicio', path: '/dashboard', icon: 'home', permissions: [] }] },
  {
    label: 'Plataforma',
    items: [{ label: 'Denominaciones', shortLabel: 'Denominac.', path: '/denominations', icon: 'landmark', permissions: ACCESS.denominations }],
  },
  {
    label: 'Organización',
    items: [
      { label: 'Sedes y razones sociales', shortLabel: 'Sedes', path: '/organization', icon: 'building', permissions: ACCESS.organization },
      { label: 'Política de datos', shortLabel: 'Política', path: '/privacy-policy', icon: 'shield-check', permissions: ACCESS.privacyPolicy },
      { label: 'Usuarios y roles', shortLabel: 'Usuarios', path: '/users', icon: 'users', permissions: ACCESS.users },
      { label: 'Plantillas de certificados', shortLabel: 'Plantillas', path: '/certificate-templates', icon: 'certificate', permissions: ACCESS.certificateTemplates },
      { label: 'Identidad visual', shortLabel: 'Identidad', path: '/branding', icon: 'sparkles', permissions: ACCESS.branding },
    ],
  },
  {
    label: 'Membresía',
    items: [
      { label: 'Solicitudes', shortLabel: 'Solicitudes', path: '/applications', icon: 'inbox', permissions: ACCESS.applications },
      { label: 'Miembros', shortLabel: 'Miembros', path: '/members', icon: 'id-card', permissions: ACCESS.members },
    ],
  },
  {
    label: 'Secretaría',
    items: [
      { label: 'Certificados y carnés', shortLabel: 'Certific.', path: '/certificates', icon: 'certificate', permissions: ACCESS.certificates },
      { label: 'Asistencia', shortLabel: 'Asistencia', path: '/attendance', icon: 'calendar-check', permissions: ACCESS.attendance },
      { label: 'Registros de secretaría', shortLabel: 'Registros', path: '/secretariat-records', icon: 'book', permissions: ACCESS.secretariatRecords },
    ],
  },
  {
    label: 'Contabilidad',
    items: [
      { label: 'Aportes', shortLabel: 'Aportes', path: '/accounting/contributions', icon: 'coins', permissions: ACCESS.contributions },
      { label: 'Votos', shortLabel: 'Votos', path: '/accounting/vows', icon: 'gift', permissions: ACCESS.vows },
      { label: 'Libro de caja', shortLabel: 'Caja', path: '/accounting/cash-book', icon: 'wallet', permissions: ACCESS.cashBook },
      { label: 'Liquidación del diezmo', shortLabel: 'Diezmo', path: '/accounting/tithe-settlements', icon: 'percent', permissions: ACCESS.titheSettlements },
      { label: 'Presupuesto', shortLabel: 'Presup.', path: '/accounting/budget', icon: 'pie-chart', permissions: ACCESS.budget },
      { label: 'Configuración contable', shortLabel: 'Config.', path: '/accounting/setup', icon: 'sliders', permissions: ACCESS.accountingSetup },
    ],
  },
  {
    label: 'Control',
    items: [
      { label: 'Reportes', shortLabel: 'Reportes', path: '/reports', icon: 'bar-chart', permissions: ACCESS.reports },
      { label: 'Auditoría', shortLabel: 'Auditoría', path: '/audit', icon: 'shield', permissions: ACCESS.audit },
    ],
  },
];

/** An action of the "Nuevo" menu of the top bar: where the person goes to create something. */
export interface QuickAction {
  readonly label: string;
  readonly path: string;
  readonly icon: IconName;
  /** Any one of these permissions shows the action. */
  readonly permissions: readonly Permission[];
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  { label: 'Registrar aporte', path: '/accounting/contributions', icon: 'coins', permissions: ['contributions.write'] },
  { label: 'Registrar movimiento de caja', path: '/accounting/cash-book', icon: 'wallet', permissions: ['cash-transactions.write'] },
  { label: 'Registrar asistencia', path: '/attendance', icon: 'calendar-check', permissions: ACCESS.attendance },
  { label: 'Emitir certificado', path: '/certificates', icon: 'certificate', permissions: ACCESS.certificates },
  { label: 'Revisar solicitudes', path: '/applications', icon: 'inbox', permissions: ACCESS.applications },
  { label: 'Nuevo miembro', path: '/members', icon: 'user-plus', permissions: ['members.write'] },
  { label: 'Invitar usuario', path: '/users', icon: 'mail', permissions: ACCESS.users },
  { label: 'Nueva sede', path: '/organization', icon: 'building', permissions: ACCESS.organization },
  { label: 'Nueva denominación', path: '/denominations', icon: 'landmark', permissions: ACCESS.denominations },
];

/** Quick actions the person is allowed to use. */
export function visibleQuickActions(canAny: (permissions: readonly Permission[]) => boolean): QuickAction[] {
  return QUICK_ACTIONS.filter((action) => canAny(action.permissions));
}

/** Groups with only the items `canAny` allows; empty groups are dropped. */
export function visibleNavGroups(canAny: (permissions: readonly Permission[]) => boolean): NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => canAny(item.permissions)),
  })).filter((group) => group.items.length > 0);
}
