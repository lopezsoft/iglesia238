import { Observable } from 'rxjs';
import {
  PlatformLegalEntityCreate,
  PlatformLegalEntityInput,
  PlatformLegalEntityRow,
} from './platform-legal-entities.models';

/**
 * Port of the legal entities of the platform. The platform admin creates the razón social of every
 * church; no denomination admin is needed. Every operation requires `denominations.manage`
 * (scope P) and a duplicate NIT is refused with 409.
 */
export abstract class PlatformLegalEntitiesRepository {
  /** All legal entities, or only the ones of `denominationId`. */
  abstract list(denominationId: number | null): Observable<PlatformLegalEntityRow[]>;
  abstract create(input: PlatformLegalEntityCreate): Observable<PlatformLegalEntityRow>;
  abstract update(id: number, input: PlatformLegalEntityInput): Observable<PlatformLegalEntityRow>;
  abstract setActive(id: number, isActive: boolean): Observable<PlatformLegalEntityRow>;
}
