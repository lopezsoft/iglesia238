import type { Transaction } from '../../../common/persistence/transaction.js';

export const CATALOGS_READER = Symbol('CATALOGS_READER');
export const PLATFORM_COUNTRY_STORE = Symbol('PLATFORM_COUNTRY_STORE');

/** A global catalog row: the code is stable and the name is what people read. */
export interface CatalogEntryView {
  readonly code: string;
  readonly name: string;
}

/** Every global catalog (the same for all denominations, loaded by the seed). */
export interface GlobalCatalogs {
  readonly documentTypes: readonly CatalogEntryView[];
  readonly maritalStatuses: readonly CatalogEntryView[];
  readonly educationLevels: readonly CatalogEntryView[];
  readonly studyTypes: readonly CatalogEntryView[];
  readonly meetingTypes: readonly CatalogEntryView[];
  readonly attendanceCategories: readonly CatalogEntryView[];
}

/** The part the public application form needs. */
export type PublicCatalogs = Pick<
  GlobalCatalogs,
  'documentTypes' | 'maritalStatuses'
>;

export interface CountryView {
  readonly id: number;
  /** ISO 3166-1 alpha-2 (CO). */
  readonly isoAlpha2: string;
  readonly name: string;
  readonly isActive: boolean;
  /** True when at least one municipality of the country is loaded. */
  readonly hasMunicipalities: boolean;
}

export interface RegionView {
  readonly countryId: number;
  /** Official code of the region (in Colombia, the 2-digit DANE department code: 05). */
  readonly code: string;
  readonly name: string;
}

export interface MunicipalityView {
  readonly countryId: number;
  /** Official code, unique inside its region (in Colombia, the DIVIPOLA code: 05001). */
  readonly code: string;
  readonly name: string;
  readonly regionCode: string;
  readonly regionName: string;
}

export interface NeighborhoodView {
  readonly id: number;
  readonly name: string;
}

export interface EnsuredNeighborhood extends NeighborhoodView {
  readonly created: boolean;
}

/**
 * A municipality is identified by its country and its code: codes are unique per region, not
 * worldwide. `countryId: null` means the default country (DEFAULT_COUNTRY_ISO), for the routes that
 * historically received a bare code.
 */
export interface MunicipalityKey {
  readonly countryId: number | null;
  readonly code: string;
}

/** Read access to the global catalogs and geography. Nothing here is tenant data. */
export interface CatalogsReader {
  listGlobalCatalogs(): Promise<GlobalCatalogs>;
  /** Ordered by name. Only the active ones unless `includeInactive`. */
  listCountries(includeInactive: boolean): Promise<CountryView[]>;
  /** Regions (departamentos/estados) of an active country, ordered by name. */
  listRegions(countryId: number): Promise<RegionView[]>;
  /** Municipalities of active countries only; `countryId` and `regionCode` narrow them down. */
  searchMunicipalities(
    search: string | null,
    limit: number,
    countryId: number | null,
    regionCode?: string | null,
  ): Promise<MunicipalityView[]>;
  findMunicipality(key: MunicipalityKey): Promise<MunicipalityView | null>;
  /** Null when the municipality does not exist. */
  listNeighborhoods(
    key: MunicipalityKey,
    search: string | null,
    limit: number,
  ): Promise<NeighborhoodView[] | null>;
  /**
   * Finds the neighborhood by name (ignoring case and accents) or creates it.
   * Null when the municipality does not exist.
   */
  ensureNeighborhood(
    key: MunicipalityKey,
    name: string,
  ): Promise<EnsuredNeighborhood | null>;
}

/** What the platform team sees of a country to decide whether it is offered. */
export interface PlatformCountryRecord extends CountryView {
  readonly isoAlpha3: string | null;
  readonly regionCount: number;
  readonly municipalityCount: number;
}

/** Platform administration of the countries the system offers (not tenant data). */
export interface PlatformCountryStore {
  /** Every country, ordered by name. */
  list(): Promise<PlatformCountryRecord[]>;
  findById(id: number): Promise<PlatformCountryRecord | null>;
  /** Legal entities of the country that are active and not deleted. */
  countActiveLegalEntities(countryId: number): Promise<number>;
  setActive(
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void>;
}
