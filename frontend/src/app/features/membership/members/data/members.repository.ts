import { Observable } from 'rxjs';
import {
  ChurchPosition,
  CongregationOption,
  ConsentView,
  FamilyRelationInput,
  FamilyRelationView,
  MemberCreateInput,
  MemberDetail,
  MemberFilters,
  MemberListPage,
  MemberListQuery,
  MemberPositionsView,
  MemberRegistryView,
  MembershipDataInput,
  PersonOption,
  PersonStudy,
  PersonStudyInput,
  PersonUpdate,
  PositionAssignmentInput,
  SocioeconomicProfile,
  SocioeconomicProfileInput,
  StatusChangeInput,
  TransferInput,
  TransferResult,
  UpdateFamilyRelationInput,
} from './members.models';

/**
 * Port of the members module. Every call runs in the scope the user is acting on (the `X-Scope`
 * header): a member of another sede or denomination answers NOT_FOUND, and writes need their own
 * permission. The adapter over the REST API is `HttpMembersRepository`.
 */
export abstract class MembersRepository {
  // List
  abstract list(query: MemberListQuery): Observable<MemberListPage>;
  /** CSV of every row matching the filters (members.read and members.write). */
  abstract exportCsv(filters: MemberFilters): Observable<Blob>;
  /** The same list as a printable directory with the letterhead of the sede (PDF), same permissions as the CSV. */
  abstract exportPdf(filters: MemberFilters): Observable<Blob>;
  abstract positionCatalog(): Observable<ChurchPosition[]>;

  // Registration
  abstract createMember(input: MemberCreateInput): Observable<MemberDetail>;
  /** People who exist but are not members yet, to register them as members. */
  abstract searchCandidates(text: string): Observable<PersonOption[]>;
  /** Adults (members or not) who can authorize the data processing of a minor. */
  abstract searchGuardians(text: string): Observable<PersonOption[]>;

  // Personal data
  abstract detail(memberId: number): Observable<MemberDetail>;
  abstract updatePerson(memberId: number, input: PersonUpdate): Observable<MemberDetail>;
  abstract updateMembership(memberId: number, input: MembershipDataInput): Observable<MemberDetail>;
  abstract changeStatus(memberId: number, input: StatusChangeInput): Observable<MemberDetail>;

  // Family
  abstract family(memberId: number): Observable<FamilyRelationView[]>;
  /** Persons of the denomination that can be linked as relatives of the member. */
  abstract searchRelatives(memberId: number, text: string): Observable<PersonOption[]>;
  abstract addFamilyRelation(memberId: number, input: FamilyRelationInput): Observable<void>;
  abstract updateFamilyRelation(
    memberId: number,
    relationId: number,
    input: UpdateFamilyRelationInput,
  ): Observable<void>;
  abstract removeFamilyRelation(memberId: number, relationId: number): Observable<void>;

  // Studies
  abstract studies(memberId: number): Observable<PersonStudy[]>;
  abstract addStudy(memberId: number, input: PersonStudyInput): Observable<void>;
  abstract updateStudy(
    memberId: number,
    studyId: number,
    input: PersonStudyInput,
  ): Observable<void>;
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
  /** Irreversible: removes the personal data once every consent was revoked. */
  abstract anonymize(memberId: number): Observable<void>;
}
