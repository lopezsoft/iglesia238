import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { ApplicationFormData } from '../../../membership-applications/domain/application-form-data.js';
import type { ApplicationStatus } from '../../../membership-applications/domain/application-status.js';

export const PUBLIC_APPLICATIONS_STORE = Symbol('PUBLIC_APPLICATIONS_STORE');

export interface NewApplication {
  denominationId: number;
  congregationId: number;
  policyId: number;
  trackingCodeHash: string;
  documentTypeCode: string;
  /** Normalized with normalizeDocumentNumber. */
  documentNumber: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string;
  /** YYYY-MM-DD */
  birthDate: string;
  guardianName: string | null;
  guardianDocument: string | null;
  formData: ApplicationFormData;
  consentedAt: Date;
}

export interface StoredStatus {
  status: ApplicationStatus;
  createdAt: Date;
  reviewedAt: Date | null;
}

export interface PublicApplicationsStore {
  trackingHashExists(hash: string): Promise<boolean>;

  /** Stores a PENDING application and returns its id. */
  create(
    application: NewApplication,
    transaction: Transaction,
  ): Promise<number>;

  /** The tracking code is never stored, only its hash. */
  findStatusByHash(hash: string): Promise<StoredStatus | null>;
}
