// Countries of the geography as the platform admin manages them (GET /platform/countries).

/** A country with the size of its geography. Only active countries can be chosen for a legal entity. */
export interface PlatformCountryRow {
  readonly id: number;
  readonly isoAlpha2: string;
  readonly name: string;
  readonly isActive: boolean;
  /** False while the platform has not loaded its municipalities. */
  readonly hasMunicipalities: boolean;
  readonly regionCount: number;
  readonly municipalityCount: number;
}

export type CountryStatusFilter = 'active' | 'all';

export const COUNTRY_STATUS_OPTIONS: readonly { readonly value: CountryStatusFilter; readonly label: string }[] = [
  { value: 'active', label: 'Activos' },
  { value: 'all', label: 'Todos' },
];
