// Global catalog types. The data comes from the API (CatalogsStore in core/catalogs).

export interface CatalogEntry {
  readonly code: string;
  readonly name: string;
}

export function catalogName(catalog: readonly CatalogEntry[], code: string | null): string {
  return catalog.find((entry) => entry.code === code)?.name ?? '—';
}

/** A municipality with its DANE DIVIPOLA code, as the API returns it. */
export interface Municipality {
  readonly code: string;
  readonly name: string;
  readonly regionCode: string;
  readonly regionName: string;
}
