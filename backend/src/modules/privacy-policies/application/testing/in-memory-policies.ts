import type { Transaction } from '../../../../common/persistence/transaction.js';
import type {
  PolicyDraft,
  PolicyRecord,
  PrivacyPoliciesRepository,
} from '../ports/privacy-policies.repository.js';

export class InMemoryPrivacyPolicies implements PrivacyPoliciesRepository {
  readonly rows: PolicyRecord[] = [];
  private nextId = 1;

  seed(row: Partial<PolicyRecord> & { denominationId: number }): PolicyRecord {
    const record: PolicyRecord = {
      id: this.nextId++,
      version: `v${this.nextId}`,
      content: 'x'.repeat(80),
      effectiveFrom: '2026-01-01',
      status: 'DRAFT',
      publishedAt: null,
      consentCount: 0,
      applicationCount: 0,
      ...row,
    };
    this.rows.push(record);
    return record;
  }

  list(denominationId: number): Promise<readonly PolicyRecord[]> {
    return Promise.resolve(
      this.rows
        .filter((row) => row.denominationId === denominationId)
        .map((row) => ({ ...row })),
    );
  }

  find(denominationId: number, id: number): Promise<PolicyRecord | null> {
    const found = this.rows.find(
      (row) => row.id === id && row.denominationId === denominationId,
    );
    return Promise.resolve(found ? { ...found } : null);
  }

  versionExists(
    denominationId: number,
    version: string,
    exceptId: number | null,
  ): Promise<boolean> {
    return Promise.resolve(
      this.rows.some(
        (row) =>
          row.denominationId === denominationId &&
          row.version === version &&
          row.id !== exceptId,
      ),
    );
  }

  latestPublishedEffectiveFrom(denominationId: number): Promise<string | null> {
    const dates = this.rows
      .filter(
        (row) =>
          row.denominationId === denominationId && row.status === 'PUBLISHED',
      )
      .map((row) => row.effectiveFrom)
      .sort();
    return Promise.resolve(dates.at(-1) ?? null);
  }

  create(
    denominationId: number,
    draft: PolicyDraft,
    _transaction: Transaction,
  ): Promise<number> {
    void _transaction;
    return Promise.resolve(this.seed({ denominationId, ...draft }).id);
  }

  updateDraft(
    denominationId: number,
    id: number,
    draft: PolicyDraft,
  ): Promise<boolean> {
    const found = this.rows.find(
      (row) =>
        row.id === id &&
        row.denominationId === denominationId &&
        row.status === 'DRAFT',
    );
    if (!found) {
      return Promise.resolve(false);
    }
    Object.assign(found, draft);
    return Promise.resolve(true);
  }

  deleteDraft(denominationId: number, id: number): Promise<boolean> {
    const index = this.rows.findIndex(
      (row) =>
        row.id === id &&
        row.denominationId === denominationId &&
        row.status === 'DRAFT',
    );
    if (index === -1) {
      return Promise.resolve(false);
    }
    this.rows.splice(index, 1);
    return Promise.resolve(true);
  }

  publish(
    denominationId: number,
    id: number,
    effectiveFrom: string,
    publishedAt: Date,
  ): Promise<boolean> {
    const found = this.rows.find(
      (row) =>
        row.id === id &&
        row.denominationId === denominationId &&
        row.status === 'DRAFT',
    );
    if (!found) {
      return Promise.resolve(false);
    }
    Object.assign(found, { status: 'PUBLISHED', effectiveFrom, publishedAt });
    return Promise.resolve(true);
  }
}
