import type { AccountRecord } from './account.repository.js';

export function accountHasChildren(
  accounts: readonly AccountRecord[],
  accountId: number,
): boolean {
  return accounts.some((account) => account.parentId === accountId);
}

/** Depth of an account in the tree (0 for a root). */
export function accountDepth(
  accounts: readonly AccountRecord[],
  account: AccountRecord,
): number {
  let depth = 0;
  let parentId = account.parentId;
  while (parentId !== null && depth < 20) {
    depth++;
    parentId = accounts.find((a) => a.id === parentId)?.parentId ?? null;
  }
  return depth;
}

/** Accounts in tree order: a parent, then its children by code. */
export function accountsInTreeOrder(
  accounts: readonly AccountRecord[],
): AccountRecord[] {
  const byParent = new Map<number | null, AccountRecord[]>();
  for (const account of accounts) {
    const siblings = byParent.get(account.parentId) ?? [];
    siblings.push(account);
    byParent.set(account.parentId, siblings);
  }
  const ordered: AccountRecord[] = [];
  const visit = (parentId: number | null): void => {
    const children = (byParent.get(parentId) ?? []).toSorted((a, b) =>
      a.code.localeCompare(b.code),
    );
    for (const child of children) {
      ordered.push(child);
      visit(child.id);
    }
  };
  visit(null);
  return ordered;
}
