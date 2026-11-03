import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';

export const MEMBERSHIP_REGISTRY = Symbol('MEMBERSHIP_REGISTRY');

export type MemberStatusValue =
  'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED';

export interface DocumentRef {
  documentTypeCode: string;
  /** Normalized with normalizeDocumentNumber. */
  documentNumber: string;
}

export interface ExistingMember {
  id: number;
  status: MemberStatusValue;
  congregationId: number;
  congregationName: string;
  congregationCode: string;
  /** Number in the current registry entry, when the member has one. */
  memberNumber: number | null;
}

/** A person of the denomination, member or not (relatives, guardians and contributors are persons too). */
export interface ExistingPerson {
  id: number;
  fullName: string;
  documentTypeCode: string | null;
  documentNumber: string | null;
  member: ExistingMember | null;
}

/** Data of a person coming from an application. Codes are the ones of the global catalogs. */
export interface PersonData {
  documentTypeCode: string;
  documentNumber: string;
  firstName: string;
  lastName: string;
  secondLastName: string | null;
  sex: 'FEMALE' | 'MALE' | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  maritalStatusCode: string | null;
  occupation: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  municipalityCode: string | null;
  neighborhood: string | null;
}

export interface NewMember {
  personId: number;
  congregationId: number;
  /** YYYY-MM-DD */
  joinedOn: string;
  previousCongregationName: string | null;
  isBaptized: boolean | null;
}

export interface MemberReactivation {
  memberId: number;
  congregationId: number;
  previousCongregationName: string | null;
}

export interface NewRegistryEntry {
  memberId: number;
  congregationId: number;
  memberNumber: number;
  registryBook: string;
  registryFolio: string;
  /** YYYY-MM-DD */
  startedOn: string;
}

export interface StatusRecord {
  memberId: number;
  status: MemberStatusValue;
  /** YYYY-MM-DD */
  startedOn: string;
  reason: string | null;
  userId: number;
}

export interface NewConsent {
  personId: number;
  guardianId: number | null;
  policyId: number;
  grantedAt: Date;
}

/**
 * What the approval of an application writes in the membership tables. Every method takes the
 * transaction of the approval, so a failure in any step leaves nothing behind. The adapter resolves
 * the catalog codes (document type, marital status, municipality) to ids.
 */
export interface MembershipRegistry {
  /** Persons of the denomination holding any of the documents. Used to detect duplicates in bulk. */
  findPeopleByDocuments(
    scope: TenantScope,
    documents: readonly DocumentRef[],
    transaction?: Transaction,
  ): Promise<readonly ExistingPerson[]>;

  findPerson(
    scope: TenantScope,
    personId: number,
    transaction?: Transaction,
  ): Promise<ExistingPerson | null>;

  createPerson(
    scope: TenantScope,
    data: PersonData,
    transaction: Transaction,
  ): Promise<number>;

  /** Fills the empty fields of an existing person; it never overwrites what the secretariat typed. */
  completePerson(
    scope: TenantScope,
    personId: number,
    data: PersonData,
    transaction: Transaction,
  ): Promise<void>;

  createMember(
    scope: TenantScope,
    member: NewMember,
    transaction: Transaction,
  ): Promise<number>;

  /** A former member who joins again: active again, in the congregation of the new application. */
  reactivateMember(
    scope: TenantScope,
    reactivation: MemberReactivation,
    transaction: Transaction,
  ): Promise<void>;

  /** Closes the open entries of the member and opens the new one. */
  openRegistryEntry(
    scope: TenantScope,
    entry: NewRegistryEntry,
    transaction: Transaction,
  ): Promise<void>;

  recordStatus(
    scope: TenantScope,
    record: StatusRecord,
    transaction: Transaction,
  ): Promise<void>;

  recordConsent(
    scope: TenantScope,
    consent: NewConsent,
    transaction: Transaction,
  ): Promise<void>;

  /** FamilyRelation GUARDIAN from the applicant to the guardian; it does nothing if it already exists. */
  linkGuardian(
    scope: TenantScope,
    personId: number,
    guardianPersonId: number,
    transaction: Transaction,
  ): Promise<void>;
}
