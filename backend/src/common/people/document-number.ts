/**
 * Canonical spelling of an identity document number. People type "1.023.456-789" or "cc 52345678";
 * the unique index of Person compares exact strings, so every write and every lookup goes through
 * this function and the database only ever sees one spelling.
 */
export function normalizeDocumentNumber(value: string): string {
  return value.replace(/[\s.-]/g, '').toUpperCase();
}
