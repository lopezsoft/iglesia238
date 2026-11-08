import { Permission } from '../permission';
import { RoleCode } from '../role';

// TEST ONLY. A copy of the role matrix of backend/prisma/seed.ts so the menu specs can build sessions
// without an API. Production code never imports it: the real permissions arrive in the session.
export const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly Permission[]>> = {
  PLATFORM_ADMIN: ['denominations.manage', 'users.manage', 'audit-logs.read'],
  DENOMINATION_ADMIN: [
    'congregations.manage',
    'users.manage',
    'certificate-types.manage',
    'branding.manage',
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
    'donation-certificates.issue',
    'contributions.write',
    'cash-transactions.write',
    'tithe-settlements.write',
    'budgets.manage',
    'reports.read',
  ],
};
