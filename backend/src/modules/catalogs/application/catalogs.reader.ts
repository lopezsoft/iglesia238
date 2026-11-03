export const CATALOGS_READER = Symbol('CATALOGS_READER');

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

export interface MunicipalityView {
  /** DIVIPOLA code (05001). */
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

/** Read access to the global catalogs and geography. Nothing here is tenant data. */
export interface CatalogsReader {
  listGlobalCatalogs(): Promise<GlobalCatalogs>;
  searchMunicipalities(
    search: string | null,
    limit: number,
  ): Promise<MunicipalityView[]>;
  findMunicipality(code: string): Promise<MunicipalityView | null>;
  /** Null when the municipality does not exist. */
  listNeighborhoods(
    municipalityCode: string,
    search: string | null,
    limit: number,
  ): Promise<NeighborhoodView[] | null>;
  /**
   * Finds the neighborhood by name (ignoring case and accents) or creates it.
   * Null when the municipality does not exist.
   */
  ensureNeighborhood(
    municipalityCode: string,
    name: string,
  ): Promise<EnsuredNeighborhood | null>;
}
