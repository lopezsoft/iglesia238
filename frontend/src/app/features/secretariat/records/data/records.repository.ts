import { Observable } from 'rxjs';
import { Page } from '../../../../shared/utils/pagination';
import {
  ChildDedication,
  ChildDedicationInput,
  DedicationQuery,
  Marriage,
  MarriageDissolutionInput,
  MarriageInput,
  MarriageQuery,
  PastoralTerm,
  PastoralTermInput,
  PastoralTermQuery,
  PeopleQuery,
  PersonOption,
  RecordsContext,
  RecordsSummary,
} from './records.models';

/**
 * Port of the secretariat records (D-04 presentations of children and marriages, D-05 pastoral
 * terms). Lists are scoped by the API to the active sede, or to the whole denomination when the
 * scope has no sede. Business rules fail with DomainError:
 * - ACTIVE_MARRIAGE_EXISTS: a spouse already has a marriage that is not dissolved.
 * - OVERLAPPING_TERM: the dates of a pastoral term overlap another term of the same sede.
 * - DEDICATION_ALREADY_RECORDED: the child was already presented.
 */
export abstract class RecordsRepository {
  abstract context(): Observable<RecordsContext>;
  abstract summary(): Observable<RecordsSummary>;

  /** People for the pickers. The API requires a search text; documents arrive masked. */
  abstract searchPeople(query: PeopleQuery): Observable<readonly PersonOption[]>;

  abstract dedications(query: DedicationQuery): Observable<Page<ChildDedication>>;
  /** Opening one record about a minor is audited by the API. */
  abstract dedication(id: number): Observable<ChildDedication>;
  abstract createDedication(input: ChildDedicationInput): Observable<ChildDedication>;

  abstract marriages(query: MarriageQuery): Observable<Page<Marriage>>;
  abstract createMarriage(input: MarriageInput): Observable<Marriage>;
  abstract dissolveMarriage(id: number, input: MarriageDissolutionInput): Observable<Marriage>;

  abstract pastoralTerms(query?: PastoralTermQuery): Observable<PastoralTerm[]>;
  abstract createPastoralTerm(input: PastoralTermInput): Observable<PastoralTerm>;
  abstract closePastoralTerm(id: number, endedOn: string): Observable<PastoralTerm>;
}
