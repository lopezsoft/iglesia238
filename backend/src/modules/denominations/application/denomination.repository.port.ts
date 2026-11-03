import type { Transaction } from '../../../common/persistence/transaction.js';
import type { DenominationTemplate } from './denomination-template.js';

export const DENOMINATION_REPOSITORY = Symbol('DENOMINATION_REPOSITORY');
export const DENOMINATION_PROVISIONER = Symbol('DENOMINATION_PROVISIONER');

export type DenominationStatusFilter = 'all' | 'active' | 'inactive';

export interface DenominationRecord {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: Date;
  /** Only rows that are not deleted. */
  readonly legalEntityCount: number;
  readonly congregationCount: number;
}

export interface DenominationListFilter {
  readonly search: string;
  readonly status: DenominationStatusFilter;
  readonly page: number;
  readonly pageSize: number;
}

export interface DenominationCounts {
  readonly total: number;
  readonly active: number;
  readonly congregations: number;
}

export interface DenominationRepository {
  list(
    filter: DenominationListFilter,
  ): Promise<{ items: DenominationRecord[]; total: number }>;
  counts(): Promise<DenominationCounts>;
  findById(id: number): Promise<DenominationRecord | null>;
  /** Id and name of every denomination: the platform has few, and uniqueness is checked in memory. */
  listNames(): Promise<{ id: number; name: string }[]>;
  create(name: string, transaction: Transaction): Promise<number>;
  rename(id: number, name: string, transaction: Transaction): Promise<void>;
  setActive(
    id: number,
    isActive: boolean,
    transaction: Transaction,
  ): Promise<void>;
}

/**
 * Creates the starting data of a denomination (fund, chart of accounts, contribution types,
 * certificate types, ranks, positions and the draft privacy policy) inside the caller's transaction.
 */
export interface DenominationProvisioner {
  provision(
    denominationId: number,
    template: DenominationTemplate,
    policyEffectiveFrom: string,
    transaction: Transaction,
  ): Promise<void>;
}
