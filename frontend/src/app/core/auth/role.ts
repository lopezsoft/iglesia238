// Mirrors ROLES in backend/prisma/seed.ts. Role names and the permissions of the signed-in user come
// from the API session: the permission matrix is never kept here (see auth/testing for the test copy).
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
