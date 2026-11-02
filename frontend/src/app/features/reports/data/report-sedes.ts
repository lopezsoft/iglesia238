/** A sede covered by a denomination-wide financial figure. */
export interface CoveredSede {
  readonly id: number;
  readonly isActive: boolean;
}

/**
 * Sedes a denomination-wide figure must cover so that every table adds up: the active sedes, in
 * their display order, followed by any deactivated sede that still owns rows (balances, cash
 * lines, contributions or periods). Deactivating a sede does not make its money disappear.
 */
export function coveredSedes(
  activeIds: readonly number[],
  ...tables: ReadonlyArray<readonly { readonly congregationId: number }[]>
): CoveredSede[] {
  const active = new Set(activeIds);
  const inactive = new Set<number>();
  for (const rows of tables) {
    for (const row of rows) {
      if (!active.has(row.congregationId)) {
        inactive.add(row.congregationId);
      }
    }
  }
  return [
    ...activeIds.map((id) => ({ id, isActive: true })),
    ...[...inactive].sort((a, b) => a - b).map((id) => ({ id, isActive: false })),
  ];
}
