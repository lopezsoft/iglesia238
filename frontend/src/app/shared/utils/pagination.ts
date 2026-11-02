export interface PageRequest {
  readonly page: number;
  readonly pageSize: number;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export function paginate<T>(rows: readonly T[], { page, pageSize }: PageRequest): Page<T> {
  const start = (page - 1) * pageSize;
  return { items: rows.slice(start, start + pageSize), total: rows.length, page, pageSize };
}

/** Case- and accent-insensitive text match for demo filters. */
export function matchesText(haystack: readonly (string | null)[], needle: string): boolean {
  const query = normalize(needle);
  return query === '' || haystack.some((value) => value !== null && normalize(value).includes(query));
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}
