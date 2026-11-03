import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { ApplicationFormData } from '../../domain/application-form-data.js';
import type {
  ApplicationCounts,
  ApplicationFilter,
  ApplicationStatus,
} from '../../domain/application-status.js';

export const APPLICATIONS_REPOSITORY = Symbol('APPLICATIONS_REPOSITORY');

/** An application with everything the review and the approval need, already joined. */
export interface ApplicationRecord {
  id: number;
  denominationId: number;
  congregationId: number;
  congregationName: string;
  congregationCode: string;
  policyId: number;
  policyVersion: string | null;
  status: ApplicationStatus;
  documentTypeCode: string | null;
  documentTypeName: string | null;
  documentNumber: string | null;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  /** YYYY-MM-DD */
  birthDate: string | null;
  guardianName: string | null;
  guardianDocument: string | null;
  formData: ApplicationFormData;
  maritalStatusName: string | null;
  municipalityName: string | null;
  regionName: string | null;
  consentedAt: Date;
  createdAt: Date;
  reviewerId: number | null;
  reviewerName: string | null;
  reviewedAt: Date | null;
  rejectionReason: string | null;
  matchedPersonId: number | null;
  memberId: number | null;
  /** Number of the member in the registry of the application's congregation, once approved. */
  memberNumber: number | null;
}

/** Row of the review queue. */
export interface ApplicationSummaryRecord {
  id: number;
  congregationId: number;
  congregationName: string;
  status: ApplicationStatus;
  firstName: string;
  lastName: string;
  secondLastName: string | null;
  documentTypeCode: string | null;
  documentNumber: string | null;
  birthDate: string | null;
  guardianName: string | null;
  createdAt: Date;
}

export interface ApplicationListQuery {
  filter: ApplicationFilter;
  /** Words that must each match the name or the document. */
  search: string | null;
  /** Narrows a denomination-wide scope to one congregation. */
  congregationId: number | null;
  /** Created from this day on (YYYY-MM-DD, Bogota). */
  from: string | null;
  /** Created up to this day, included (YYYY-MM-DD, Bogota). */
  to: string | null;
  order: 'asc' | 'desc';
  page: number;
  pageSize: number;
}

export interface ApplicationListResult {
  items: readonly ApplicationSummaryRecord[];
  /** Rows matching every filter. */
  total: number;
  /** Per chip, ignoring the chip, the search and the dates: it only respects the scope. */
  counts: ApplicationCounts;
}

export interface ApplicationChange {
  status: ApplicationStatus;
  reviewerId: number;
  reviewedAt: Date | null;
  rejectionReason?: string | null;
  matchedPersonId?: number | null;
}

/**
 * Persistence of the applications queue. Every method takes a TenantScope: an application of another
 * denomination, or of another congregation when the scope has one, simply does not exist.
 */
export interface ApplicationsRepository {
  list(
    scope: TenantScope,
    query: ApplicationListQuery,
  ): Promise<ApplicationListResult>;

  findById(
    scope: TenantScope,
    id: number,
    transaction?: Transaction,
  ): Promise<ApplicationRecord | null>;

  /**
   * Moves the application to a new status only while it is still in one of the `from` statuses.
   * Returns false when someone else got there first, so two reviewers cannot both decide.
   */
  transition(
    scope: TenantScope,
    id: number,
    from: readonly ApplicationStatus[],
    change: ApplicationChange,
    transaction: Transaction,
  ): Promise<boolean>;

  /** Links the member created by the approval. */
  attachMember(
    scope: TenantScope,
    id: number,
    memberId: number,
    transaction: Transaction,
  ): Promise<void>;
}
