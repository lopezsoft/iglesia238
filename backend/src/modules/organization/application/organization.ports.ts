import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';

export const CONGREGATION_REPOSITORY = Symbol('CONGREGATION_REPOSITORY');
export const LEGAL_ENTITY_REPOSITORY = Symbol('LEGAL_ENTITY_REPOSITORY');
export const DISTRICT_REPOSITORY = Symbol('DISTRICT_REPOSITORY');
export const GEO_REPOSITORY = Symbol('GEO_REPOSITORY');
export const ORGANIZATION_OVERVIEW_READER = Symbol(
  'ORGANIZATION_OVERVIEW_READER',
);

export interface MunicipalityRef {
  readonly id: number;
  /** DIVIPOLA code. */
  readonly code: string;
  readonly name: string;
  readonly regionName: string;
}

export interface NeighborhoodRef {
  readonly id: number;
  readonly name: string;
}

// ---------------------------------------------------------------------------------------------
// Records: what the repositories return. Never Prisma entities.
// ---------------------------------------------------------------------------------------------

export interface LegalEntityRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly legalRepresentative: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
  readonly municipalityCode: string | null;
  readonly municipalityName: string | null;
  readonly regionName: string | null;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export interface DistrictRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly number: string;
  readonly name: string | null;
  readonly congregationNames: readonly string[];
}

export interface CongregationRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly legalEntityId: number;
  readonly legalEntityName: string;
  readonly districtId: number | null;
  readonly districtNumber: string | null;
  readonly code: string;
  readonly name: string;
  readonly municipalityCode: string | null;
  readonly municipalityName: string | null;
  readonly regionName: string | null;
  readonly neighborhood: string | null;
  readonly address: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly acceptsApplications: boolean;
  readonly isActive: boolean;
  readonly createdAt: Date;
}

export interface OrganizationCounts {
  readonly denominationName: string;
  readonly activeCongregations: number;
  readonly totalCongregations: number;
  readonly acceptingApplications: number;
  readonly legalEntities: number;
  readonly districts: number;
}

// ---------------------------------------------------------------------------------------------
// Data the use cases write, already validated and resolved to ids.
// ---------------------------------------------------------------------------------------------

export interface CongregationData {
  readonly name: string;
  readonly code: string;
  readonly legalEntityId: number;
  readonly districtId: number | null;
  readonly municipalityId: number;
  readonly neighborhoodId: number | null;
  readonly address: string;
  readonly phone: string | null;
  readonly email: string | null;
  readonly acceptsApplications: boolean;
}

export interface LegalEntityData {
  readonly legalName: string;
  readonly tradeName: string | null;
  readonly taxId: string;
  readonly legalRepresentative: string;
  readonly municipalityId: number;
  readonly email: string | null;
  readonly phone: string | null;
  readonly address: string | null;
}

export interface DistrictData {
  readonly number: string;
  readonly name: string | null;
}

// ---------------------------------------------------------------------------------------------
// Ports. Every method of a tenant table takes the TenantScope: a query without it does not compile.
// ---------------------------------------------------------------------------------------------

export interface CongregationRepository {
  list(scope: TenantScope): Promise<CongregationRecord[]>;
  findById(scope: TenantScope, id: number): Promise<CongregationRecord | null>;
  /** Active congregations the scope reaches: one for a congregation scope, all for a denomination. */
  listSelectable(scope: TenantScope): Promise<CongregationRecord[]>;
  /** Name and code of every congregation of the denomination, to check uniqueness and generate codes. */
  listIdentifiers(
    scope: TenantScope,
  ): Promise<{ id: number; name: string; code: string }[]>;
  create(
    scope: TenantScope,
    data: CongregationData,
    transaction: Transaction,
  ): Promise<number>;
  update(
    scope: TenantScope,
    id: number,
    data: CongregationData,
    transaction: Transaction,
  ): Promise<void>;
  patch(
    scope: TenantScope,
    id: number,
    change: { isActive?: boolean; acceptsApplications?: boolean },
    transaction: Transaction,
  ): Promise<void>;
}

export interface LegalEntityRepository {
  list(scope: TenantScope): Promise<LegalEntityRecord[]>;
  findById(scope: TenantScope, id: number): Promise<LegalEntityRecord | null>;
  /**
   * The NIT is unique on the whole platform, so this lookup is the one that is NOT limited to the
   * denomination. It only answers whether the canonical NIT is taken.
   */
  taxIdExists(taxId: string, exceptId: number | null): Promise<boolean>;
  countActiveCongregations(scope: TenantScope, id: number): Promise<number>;
  create(
    scope: TenantScope,
    data: LegalEntityData,
    transaction: Transaction,
  ): Promise<number>;
  update(
    scope: TenantScope,
    id: number,
    data: LegalEntityData,
    transaction: Transaction,
  ): Promise<void>;
  setActive(
    scope: TenantScope,
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void>;
}

export interface DistrictRepository {
  list(scope: TenantScope): Promise<DistrictRecord[]>;
  findById(scope: TenantScope, id: number): Promise<DistrictRecord | null>;
  create(
    scope: TenantScope,
    data: DistrictData,
    transaction: Transaction,
  ): Promise<number>;
  update(
    scope: TenantScope,
    id: number,
    data: DistrictData,
    transaction: Transaction,
  ): Promise<void>;
}

/** Global geography catalog (not tenant data). */
export interface GeoRepository {
  findMunicipalityByCode(code: string): Promise<MunicipalityRef | null>;
  /** Neighborhoods are shared by every denomination: a name that exists is reused. */
  findOrCreateNeighborhood(
    municipalityId: number,
    name: string,
    transaction: Transaction,
  ): Promise<NeighborhoodRef>;
}

export interface OrganizationOverviewReader {
  read(scope: TenantScope): Promise<OrganizationCounts | null>;
}
