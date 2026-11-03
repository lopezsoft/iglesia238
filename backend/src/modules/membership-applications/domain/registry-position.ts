/** Members per registry book. A book is a physical ledger of the secretariat. */
export const MEMBERS_PER_REGISTRY_BOOK = 100;

export interface RegistryPosition {
  book: string;
  folio: string;
}

/**
 * Book and folio of a member number: number 1 is book 1 folio 1, number 100 is book 1 folio 100 and
 * number 101 opens book 2. It only suggests a position; the secretariat can correct it afterwards.
 */
export function registryPositionOf(memberNumber: number): RegistryPosition {
  const index = memberNumber - 1;
  return {
    book: String(Math.floor(index / MEMBERS_PER_REGISTRY_BOOK) + 1),
    folio: String((index % MEMBERS_PER_REGISTRY_BOOK) + 1),
  };
}
