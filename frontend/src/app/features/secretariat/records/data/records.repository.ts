import { Observable } from 'rxjs';
import {
  ChildDedication,
  ChildDedicationInput,
  Marriage,
  MarriageDissolutionInput,
  MarriageInput,
  PastoralTerm,
  PastoralTermInput,
  RecordsContext,
} from './records.models';

/**
 * Port of the secretariat records (D-04 presentations of children and marriages, D-05
 * pastoral terms). Lists are scoped to the active sede, or to the whole denomination when the
 * scope has no sede. Business rules fail with DomainError:
 * - ACTIVE_MARRIAGE_EXISTS: a spouse already has a marriage that is not dissolved.
 * - OVERLAPPING_TERM: the dates of a pastoral term overlap another term of the same sede.
 */
export abstract class RecordsRepository {
  abstract context(): Observable<RecordsContext>;

  abstract dedications(): Observable<ChildDedication[]>;
  abstract createDedication(input: ChildDedicationInput): Observable<ChildDedication>;

  abstract marriages(): Observable<Marriage[]>;
  abstract createMarriage(input: MarriageInput): Observable<Marriage>;
  abstract dissolveMarriage(id: number, input: MarriageDissolutionInput): Observable<Marriage>;

  abstract pastoralTerms(): Observable<PastoralTerm[]>;
  abstract createPastoralTerm(input: PastoralTermInput): Observable<PastoralTerm>;
}
