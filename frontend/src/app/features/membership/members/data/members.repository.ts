import { Observable } from 'rxjs';
import {
  ChurchPosition,
  CongregationOption,
  ConsentView,
  FamilyRelationInput,
  FamilyRelationView,
  MemberDetail,
  MemberFilters,
  MemberListItem,
  MemberListPage,
  MemberListQuery,
  MemberPositionsView,
  MemberRegistryView,
  PersonOption,
  PersonStudy,
  PersonStudyInput,
  PersonUpdate,
  PositionAssignmentInput,
  SocioeconomicProfile,
  SocioeconomicProfileInput,
  TransferInput,
  TransferResult,
} from './members.models';

/**
 * Port of the members module. Every call runs in the tenant of the active scope: a member of
 * another sede or denomination answers NOT_FOUND, and writes check their own permission.
 */
export abstract class MembersRepository {
  // List
  abstract list(query: MemberListQuery): Observable<MemberListPage>;
  /** Every row matching the filters, for the CSV export (members.write). */
  abstract exportRows(filters: MemberFilters): Observable<MemberListItem[]>;
  abstract positionCatalog(): Observable<ChurchPosition[]>;

  // Personal data
  abstract detail(memberId: number): Observable<MemberDetail>;
  abstract updatePerson(memberId: number, input: PersonUpdate): Observable<MemberDetail>;

  // Family
  abstract family(memberId: number): Observable<FamilyRelationView[]>;
  /** Persons of the denomination that can be linked as relatives of the member. */
  abstract searchRelatives(memberId: number, text: string): Observable<PersonOption[]>;
  abstract addFamilyRelation(memberId: number, input: FamilyRelationInput): Observable<void>;
  abstract removeFamilyRelation(memberId: number, relationId: number): Observable<void>;

  // Studies
  abstract studies(memberId: number): Observable<PersonStudy[]>;
  abstract addStudy(memberId: number, input: PersonStudyInput): Observable<void>;
  abstract removeStudy(memberId: number, studyId: number): Observable<void>;

  // Positions and pastoral rank
  abstract positions(memberId: number): Observable<MemberPositionsView>;
  abstract assignPosition(memberId: number, input: PositionAssignmentInput): Observable<void>;
  abstract closePosition(
    memberId: number,
    memberPositionId: number,
    endedOn: string,
  ): Observable<void>;
  abstract setPastoralRank(memberId: number, pastoralRankId: number | null): Observable<void>;

  // Socioeconomic profile (socioeconomic-profiles.read / .write)
  abstract socioeconomicProfile(memberId: number): Observable<SocioeconomicProfile | null>;
  abstract saveSocioeconomicProfile(
    memberId: number,
    input: SocioeconomicProfileInput,
  ): Observable<SocioeconomicProfile>;

  // Registry and transfers
  abstract registry(memberId: number): Observable<MemberRegistryView>;
  abstract transferDestinations(memberId: number): Observable<CongregationOption[]>;
  abstract transfer(memberId: number, input: TransferInput): Observable<TransferResult>;

  // Data consents
  abstract consents(memberId: number): Observable<ConsentView[]>;
  abstract revokeConsent(memberId: number, consentId: number): Observable<void>;
}
