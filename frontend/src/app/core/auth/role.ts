import { Permission } from './permission';

// Mirrors ROLES in backend/prisma/seed.ts.
export const ROLE_CODES = [
  'PLATFORM_ADMIN',
  'DENOMINATION_ADMIN',
  'PASTOR',
  'SECRETARY',
  'TREASURER',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export const ROLE_NAMES: Readonly<Record<RoleCode, string>> = {
  PLATFORM_ADMIN: 'Administrador de plataforma',
  DENOMINATION_ADMIN: 'Administrador de denominación',
  PASTOR: 'Pastor',
  SECRETARY: 'Secretario(a)',
  TREASURER: 'Tesorero(a)',
};

export const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> = {
  PLATFORM_ADMIN: ['denominations.manage', 'users.manage', 'audit-logs.read'],
  DENOMINATION_ADMIN: [
    'congregations.manage',
    'users.manage',
    'members.read',
    'reports.read',
    'audit-logs.read',
  ],
  PASTOR: [
    'applications.review',
    'members.read',
    'members.write',
    'socioeconomic-profiles.read',
    'certificates.issue',
    'contributions.read',
    'reports.read',
  ],
  SECRETARY: [
    'applications.review',
    'members.read',
    'members.write',
    'socioeconomic-profiles.read',
    'socioeconomic-profiles.write',
    'certificates.issue',
    'attendance.write',
  ],
  TREASURER: [
    'contributions.read',
    'contributions.write',
    'cash-transactions.write',
    'tithe-settlements.write',
    'budgets.manage',
    'reports.read',
  ],
};
