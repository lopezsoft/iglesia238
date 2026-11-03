/** Permissions of the seed that the accounting endpoints check. */
export const AccountingPermissions = {
  contributionsRead: 'contributions.read',
  contributionsWrite: 'contributions.write',
  cashWrite: 'cash-transactions.write',
  titheWrite: 'tithe-settlements.write',
  budgetsManage: 'budgets.manage',
} as const;

/**
 * Catalogs (funds, accounts, contribution types, periods, tithe rules) are read by every accounting
 * screen, so any of these permissions opens them; only writing them needs budgets.manage.
 */
export const CATALOG_READ_PERMISSIONS: readonly string[] = [
  AccountingPermissions.contributionsRead,
  AccountingPermissions.cashWrite,
  AccountingPermissions.budgetsManage,
  AccountingPermissions.titheWrite,
];
