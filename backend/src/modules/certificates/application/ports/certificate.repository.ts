import type { Page } from '../../../../common/pagination/page.js';
import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { CertificateSnapshot } from '../certificate-document.js';
import type {
  CertificateFilter,
  CertificateRecord,
  CertificateTypeRecord,
  PageParams,
} from '../certificate.models.js';

export const CERTIFICATE_REPOSITORY = Symbol('CERTIFICATE_REPOSITORY');

export interface NewCertificate {
  readonly certificateTypeId: number;
  readonly memberId: number;
  readonly sequenceNumber: number;
  readonly issuedOn: string;
  readonly expiresOn: string | null;
  readonly notes: string | null;
  readonly pastorSignerId: number;
  readonly secretarySignerId: number | null;
  readonly issuedById: number;
  readonly snapshot: CertificateSnapshot;
}

/**
 * Persistence of certificates and their types. Every method takes the TenantScope of the request:
 * a row of another denomination (or, for a congregation scope, of another sede) is never returned.
 */
export interface CertificateRepository {
  listTypes(scope: TenantScope): Promise<readonly CertificateTypeRecord[]>;
  findType(
    scope: TenantScope,
    typeId: number,
  ): Promise<CertificateTypeRecord | null>;
  /** Last issued number per type code in the congregation of the scope (0 when none). */
  lastSequenceValues(
    scope: TenantScope,
    typeCodes: readonly string[],
  ): Promise<ReadonlyMap<string, number>>;
  /** The congregation is the one of the scope, which must be a congregation scope. */
  insert(
    scope: TenantScope,
    data: NewCertificate,
    transaction: Transaction,
  ): Promise<CertificateRecord>;
  findById(scope: TenantScope, id: number): Promise<CertificateRecord | null>;
  list(
    scope: TenantScope,
    filter: CertificateFilter,
    paging: PageParams,
  ): Promise<Page<CertificateRecord>>;
  /** Same filter as `list`, newest first, capped. For the CSV export. */
  listForExport(
    scope: TenantScope,
    filter: CertificateFilter,
    limit: number,
  ): Promise<readonly CertificateRecord[]>;
  /** False when the certificate was already voided or does not belong to the scope. */
  markVoided(
    scope: TenantScope,
    id: number,
    reason: string,
    at: Date,
    transaction: Transaction,
  ): Promise<boolean>;
  countIssued(
    scope: TenantScope,
    range: { from: string; to: string },
  ): Promise<{ issued: number; voided: number }>;
}
