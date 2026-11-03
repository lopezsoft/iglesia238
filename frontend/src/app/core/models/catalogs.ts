// Global catalog types. The data comes from the API (CatalogsStore in core/catalogs).

export interface CatalogEntry {
  readonly code: string;
  readonly name: string;
}

export function catalogName(catalog: readonly CatalogEntry[], code: string | null): string {
  return catalog.find((entry) => entry.code === code)?.name ?? '—';
}

/** A municipality with its official code (DIVIPOLA in Colombia), as the API returns it. */
export interface Municipality {
  readonly code: string;
  readonly name: string;
  readonly regionCode: string;
  readonly regionName: string;
  /** Country the municipality belongs to. */
  readonly countryId?: number;
}

/** A country of the geography (countries -> regions -> municipalities), as GET /geo/countries returns it. */
export interface Country {
  readonly id: number;
  readonly isoAlpha2: string;
  readonly name: string;
  /** False while the platform has not loaded the municipalities of the country. */
  readonly hasMunicipalities: boolean;
  /** GET /geo/countries only returns active countries; inactive ones cannot be chosen. */
  readonly isActive?: boolean;
}

/**
 * ISO code of the country preselected in the "País" selects. It is only a default for new records:
 * every other rule reads the country from the API data.
 */
export const DEFAULT_COUNTRY_ISO = 'CO';

/** Id of the default country when the API lists it; otherwise `null` (the person must choose). */
export function defaultCountryId(countries: readonly Country[]): number | null {
  return countries.find((country) => country.isoAlpha2.toUpperCase() === DEFAULT_COUNTRY_ISO)?.id ?? null;
}

/** Message shown instead of the municipality search when a country has no municipalities loaded. */
export const NO_MUNICIPALITIES_MESSAGE = 'No hay municipios cargados para este país.';
