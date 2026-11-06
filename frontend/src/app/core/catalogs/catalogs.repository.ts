import { Observable, of } from 'rxjs';
import { CatalogEntry, Country, Municipality, Region } from '../models/catalogs';

/** Every global catalog (the same for all denominations). The public form has its own, smaller repository. */
export interface Catalogs {
  readonly documentTypes: readonly CatalogEntry[];
  readonly maritalStatuses: readonly CatalogEntry[];
  readonly educationLevels: readonly CatalogEntry[];
  readonly studyTypes: readonly CatalogEntry[];
  readonly meetingTypes: readonly CatalogEntry[];
  readonly attendanceCategories: readonly CatalogEntry[];
}

export interface MunicipalitySearch {
  /** Text to look for in the name, or the start of the DIVIPOLA code. */
  readonly search: string;
  /** Default 20, at most 50. */
  readonly limit?: number;
  /** Only municipalities of this country; every country when it is left out. */
  readonly countryId?: number | null;
  /** Only municipalities of this region (departamento/estado); every region when it is left out. */
  readonly regionCode?: string | null;
  /** Uses the endpoint that needs no session (the public application form). */
  readonly publicAccess?: boolean;
}

/**
 * Port to the catalogs API (`/api/catalogs` and `/api/geo/*`). Municipalities are identified by their
 * official code (DIVIPOLA in Colombia, e.g. `05001`) and belong to a region and country.
 */
export abstract class CatalogsRepository {
  abstract catalogs(): Observable<Catalogs>;

  /**
   * Active countries of the geography; the ones with `hasMunicipalities: false` have no municipality
   * to pick yet.
   */
  abstract countries(): Observable<readonly Country[]>;

  /** Regions (departamentos, estados or provincias) of an active country, sorted by name. */
  regions(_countryId: number, _publicAccess = false): Observable<readonly Region[]> {
    return of([]);
  }

  abstract searchMunicipalities(query: MunicipalitySearch): Observable<readonly Municipality[]>;

  /** Fails with DomainError 'NOT_FOUND' for an unknown code. */
  abstract municipality(code: string): Observable<Municipality>;
}
