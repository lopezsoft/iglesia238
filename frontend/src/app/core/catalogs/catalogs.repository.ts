import { Observable } from 'rxjs';
import { CatalogEntry, Municipality } from '../models/catalogs';

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
  /** Uses the endpoint that needs no session (the public application form). */
  readonly publicAccess?: boolean;
}

/**
 * Port to the catalogs API (`/api/catalogs` and `/api/geo/municipalities`). Municipalities are identified
 * by their DIVIPOLA code (`05001`). The neighborhood is free text in every form, so the API's
 * find-or-create neighborhood routes have no port here.
 */
export abstract class CatalogsRepository {
  abstract catalogs(): Observable<Catalogs>;

  abstract searchMunicipalities(query: MunicipalitySearch): Observable<readonly Municipality[]>;

  /** Fails with DomainError 'NOT_FOUND' for an unknown code. */
  abstract municipality(code: string): Observable<Municipality>;
}
