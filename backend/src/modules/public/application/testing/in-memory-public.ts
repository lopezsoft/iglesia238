import type { Transaction } from '../../../../common/persistence/transaction.js';
import type {
  NewApplication,
  PublicApplicationsStore,
  StoredStatus,
} from '../ports/public-applications.store.js';
import type {
  CongregationTarget,
  CurrentPolicyRecord,
  OpenCongregationRecord,
  PublicDirectory,
  PublicLegalEntityRecord,
} from '../ports/public-directory.reader.js';

export interface StoredApplication extends NewApplication {
  id: number;
  status: StoredStatus['status'];
  reviewedAt: Date | null;
  createdAt: Date;
}

interface CongregationRow {
  id: number;
  denominationId: number;
  isOpen: boolean;
}

export class InMemoryPublicWorld
  implements PublicDirectory, PublicApplicationsStore
{
  congregations: CongregationRow[] = [
    { id: 10, denominationId: 1, isOpen: true },
    { id: 11, denominationId: 1, isOpen: false },
    { id: 20, denominationId: 2, isOpen: true },
  ];
  policies: CurrentPolicyRecord[] = [
    {
      id: 5,
      denominationId: 1,
      version: '1.0',
      content: 'Texto',
      effectiveFrom: '2026-01-01',
    },
    {
      id: 6,
      denominationId: 2,
      version: '1.0',
      content: 'Otro texto',
      effectiveFrom: '2026-01-01',
    },
  ];
  documentTypes = new Set(['CC', 'TI', 'RC']);
  maritalStatuses = new Set(['SINGLE', 'MARRIED']);
  educationLevels = new Set(['NONE', 'PRIMARY', 'SECONDARY', 'TECHNICAL', 'UNIVERSITY', 'POSTGRADUATE']);
  municipalities = new Set(['13001', '05001']);
  applications: StoredApplication[] = [];
  /** Hashes that already exist, to force a collision. */
  takenHashes = new Set<string>();
  private nextId = 1;

  listOpenCongregations(): Promise<readonly OpenCongregationRecord[]> {
    return Promise.resolve(
      this.congregations
        .filter(
          (row) =>
            row.isOpen &&
            this.policies.some((p) => p.denominationId === row.denominationId),
        )
        .map((row) => ({
          id: row.id,
          denominationId: row.denominationId,
          denominationName: `Denominación ${row.denominationId}`,
          name: `Sede ${row.id}`,
          countryId: 46,
          municipalityCode: '13001',
          municipalityName: 'Cartagena',
          regionName: 'Bolívar',
          neighborhood: null,
          address: null,
        })),
    );
  }

  legalEntities: PublicLegalEntityRecord[] = [];

  listLegalEntities(): Promise<readonly PublicLegalEntityRecord[]> {
    return Promise.resolve(this.legalEntities);
  }

  findOpenCongregation(id: number): Promise<CongregationTarget | null> {
    const found = this.congregations.find((row) => row.id === id && row.isOpen);
    return Promise.resolve(
      found ? { id: found.id, denominationId: found.denominationId } : null,
    );
  }

  findCurrentPolicy(
    denominationId: number,
  ): Promise<CurrentPolicyRecord | null> {
    return Promise.resolve(
      this.policies.find(
        (policy) => policy.denominationId === denominationId,
      ) ?? null,
    );
  }

  documentTypeExists(code: string): Promise<boolean> {
    return Promise.resolve(this.documentTypes.has(code));
  }

  maritalStatusExists(code: string): Promise<boolean> {
    return Promise.resolve(this.maritalStatuses.has(code));
  }

  educationLevelExists(code: string): Promise<boolean> {
    return Promise.resolve(this.educationLevels.has(code));
  }

  municipalityExists(code: string): Promise<boolean> {
    return Promise.resolve(this.municipalities.has(code));
  }

  trackingHashExists(hash: string): Promise<boolean> {
    return Promise.resolve(
      this.takenHashes.has(hash) ||
        this.applications.some(
          (application) => application.trackingCodeHash === hash,
        ),
    );
  }

  create(
    application: NewApplication,
    _transaction: Transaction,
  ): Promise<number> {
    void _transaction;
    const id = this.nextId++;
    this.applications.push({
      ...application,
      id,
      status: 'PENDING',
      reviewedAt: null,
      createdAt: new Date('2026-11-02T15:00:00.000Z'),
    });
    return Promise.resolve(id);
  }

  findStatusByHash(hash: string): Promise<StoredStatus | null> {
    const found = this.applications.find(
      (application) => application.trackingCodeHash === hash,
    );
    return Promise.resolve(
      found
        ? {
            status: found.status,
            createdAt: found.createdAt,
            reviewedAt: found.reviewedAt,
          }
        : null,
    );
  }
}
