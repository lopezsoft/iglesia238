import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { ExistingPerson, ResolvedPersonData } from '../member.models.js';

export const PERSON_REPOSITORY = Symbol('PERSON_REPOSITORY');
export const CATALOG_RESOLVER = Symbol('CATALOG_RESOLVER');

/** Persons belong to a denomination: the scope's congregation does not limit them. */
export interface PersonRepository {
  findExisting(
    scope: TenantScope,
    personId: number,
    transaction?: Transaction,
  ): Promise<ExistingPerson | null>;

  /** Person with that (normalized) document in the denomination, other than `exceptPersonId`. */
  findByDocument(
    scope: TenantScope,
    documentTypeId: number,
    documentNumber: string,
    exceptPersonId: number | null,
    transaction?: Transaction,
  ): Promise<ExistingPerson | null>;

  insert(
    scope: TenantScope,
    data: ResolvedPersonData,
    transaction: Transaction,
  ): Promise<number>;

  /** Replaces the person's data; contacts and address are created, updated or removed accordingly. */
  update(
    scope: TenantScope,
    personId: number,
    data: ResolvedPersonData,
    transaction: Transaction,
  ): Promise<void>;

  /**
   * Irreversibly removes the personal data of the person (names, document, birth data, contacts,
   * addresses, socioeconomic profile). Ids and relations stay so records remain consistent.
   */
  anonymize(
    scope: TenantScope,
    personId: number,
    transaction: Transaction,
  ): Promise<void>;
}

export interface CatalogCodes {
  readonly documentTypeCode: string | null;
  readonly maritalStatusCode: string | null;
  readonly educationLevelCode: string | null;
  readonly municipalityCode: string | null;
  readonly documentIssuePlaceCode?: string | null;
  readonly birthPlaceCode?: string | null;
}

export interface CatalogIds {
  readonly documentTypeId: number | null;
  readonly maritalStatusId: number | null;
  readonly educationLevelId: number | null;
  readonly municipalityId: number | null;
  readonly documentIssuePlaceId?: number | null;
  readonly birthPlaceId?: number | null;
}

export type CatalogKind =
  'documentType' | 'maritalStatus' | 'educationLevel' | 'municipality';

export interface CatalogResolution {
  readonly ids: CatalogIds;
  /** Catalogs whose code does not exist. */
  readonly unknown: readonly CatalogKind[];
}

/** Translates the codes of the global catalogs to ids. */
export interface CatalogResolver {
  resolve(codes: CatalogCodes): Promise<CatalogResolution>;
  studyTypeId(code: string): Promise<number | null>;
}
