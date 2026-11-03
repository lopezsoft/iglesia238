import type { DocumentSequenceStore } from '../../../../common/numbering/document-sequence.store.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';

/** Counters per (denomination, congregation, key), like the DocumentSequence table. */
export class InMemorySequenceStore implements DocumentSequenceStore {
  private readonly counters = new Map<string, number>();

  next(scope: TenantScope, key: string): Promise<number> {
    const id = `${scope.denominationId}/${scope.congregationId}/${key}`;
    const value = (this.counters.get(id) ?? 0) + 1;
    this.counters.set(id, value);
    return Promise.resolve(value);
  }
}
