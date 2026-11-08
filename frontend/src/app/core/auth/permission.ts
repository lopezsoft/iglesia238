// Mirrors PERMISSIONS in backend/prisma/seed.ts. The API is the source of truth: the session
// (`assignments[].permissions`) carries what each role grants, computed from the database, and
// this list only types the codes and describes them for the profile screen.
export const PERMISSIONS = [
  'denominations.manage',
  'congregations.manage',
  'users.manage',
  'applications.review',
  'members.read',
  'members.write',
  'socioeconomic-profiles.read',
  'socioeconomic-profiles.write',
  'certificates.issue',
  'certificate-types.manage',
  'donation-certificates.issue',
  'branding.manage',
  'attendance.write',
  'contributions.read',
  'contributions.write',
  'cash-transactions.write',
  'tithe-settlements.write',
  'budgets.manage',
  'reports.read',
  'audit-logs.read',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PERMISSION_DESCRIPTIONS: Readonly<Record<Permission, string>> = {
  'denominations.manage': 'Crear y administrar denominaciones',
  'congregations.manage': 'Administrar sedes, razones sociales y distritos',
  'users.manage': 'Gestionar usuarios y asignar roles',
  'applications.review': 'Revisar y aprobar solicitudes de membresía',
  'members.read': 'Consultar miembros',
  'members.write': 'Editar miembros y registros de secretaría',
  'socioeconomic-profiles.read': 'Consultar la ficha socioeconómica',
  'socioeconomic-profiles.write': 'Editar la ficha socioeconómica',
  'certificates.issue': 'Emitir certificados y carnés',
  'certificate-types.manage': 'Editar los textos de los certificados de la denominación',
  'donation-certificates.issue': 'Emitir y consultar certificados de donaciones (solo ese tipo)',
  'branding.manage': 'Cambiar el logo y el color de los documentos de la denominación',
  'attendance.write': 'Registrar asistencia',
  'contributions.read': 'Consultar aportes y votos',
  'contributions.write': 'Registrar y anular aportes',
  'cash-transactions.write': 'Llevar el libro de caja',
  'tithe-settlements.write': 'Liquidar el diezmo',
  'budgets.manage': 'Administrar presupuesto y configuración contable',
  'reports.read': 'Consultar reportes',
  'audit-logs.read': 'Consultar la auditoría',
};
