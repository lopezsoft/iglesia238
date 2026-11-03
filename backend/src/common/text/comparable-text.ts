/** Collapses runs of whitespace and trims: "  Iglesia   Central " becomes "Iglesia Central". */
export function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

/**
 * Key for uniqueness rules that ignore case and accents: "Iglesia Cristiana Sión" and
 * "iglesia cristiana sion" produce the same key. The database collation is not relied upon.
 */
export function comparableText(value: string): string {
  return collapseSpaces(value)
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Sorts Spanish text the way people expect (accents and case do not break the order). */
export function compareSpanish(
  left: string,
  right: string,
  numeric = false,
): number {
  return left.localeCompare(right, 'es', { numeric });
}
