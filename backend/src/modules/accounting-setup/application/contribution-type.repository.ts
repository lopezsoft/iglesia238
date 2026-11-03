import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { ContributionCategoryValue } from './setup.views.js';

export const CONTRIBUTION_TYPE_REPOSITORY = Symbol(
  'CONTRIBUTION_TYPE_REPOSITORY',
);

export interface ContributionTypeRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly category: ContributionCategoryValue;
  readonly code: string;
  readonly name: string;
  readonly accountId: number;
  readonly isActive: boolean;
  readonly accountCode: string;
  readonly accountName: string;
  readonly contributionCount: number;
}

export interface ContributionTypeData {
  readonly code: string;
  readonly name: string;
  readonly category: ContributionCategoryValue;
  readonly accountId: number;
}

/** Contribution types belong to the denomination. */
export interface ContributionTypeRepository {
  list(scope: TenantScope): Promise<ContributionTypeRecord[]>;
  find(scope: TenantScope, id: number): Promise<ContributionTypeRecord | null>;
  create(
    scope: TenantScope,
    data: ContributionTypeData,
    transaction: Transaction,
  ): Promise<number>;
  update(
    scope: TenantScope,
    id: number,
    data: ContributionTypeData,
    transaction: Transaction,
  ): Promise<void>;
  setActive(
    scope: TenantScope,
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void>;
}
