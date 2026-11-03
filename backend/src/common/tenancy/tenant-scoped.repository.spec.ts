import { describeCrossTenantIsolation } from '../../../test/support/cross-tenant.js';
import { NotFoundDomainException } from '../errors/domain.exception.js';
import { TenantScope } from './tenant-scope.js';
import { TenantScopedRepository } from './tenant-scoped.repository.js';

interface Row {
  id: number;
  denominationId: number;
  congregationId: number;
  name: string;
}

/** In-memory repository that filters exactly as a Prisma repository would with `scoped()`. */
class FakeNotesRepository extends TenantScopedRepository {
  readonly rows: Row[] = [];

  find(scope: TenantScope, id: number): Row {
    const where = this.scoped(scope, { id });
    const row = this.rows.find((candidate) =>
      Object.entries(where).every(
        ([key, value]) => candidate[key as keyof Row] === value,
      ),
    );
    return this.orNotFound(row);
  }

  where(scope: TenantScope, extra?: { name: string }) {
    return this.scoped(scope, extra);
  }

  whereCongregation(scope: TenantScope, congregationId: number) {
    return this.scopedToCongregation(scope, congregationId);
  }
}

describe('TenantScopedRepository', () => {
  it('always adds the tenant keys', () => {
    const repository = new FakeNotesRepository();

    expect(repository.where(TenantScope.of(1, 10), { name: 'x' })).toEqual({
      name: 'x',
      denominationId: 1,
      congregationId: 10,
    });
  });

  it('does not let the extra conditions override the tenant', () => {
    const repository = new FakeNotesRepository();
    const hostile = { denominationId: 999, congregationId: 999 };

    expect(
      repository.where(TenantScope.of(1, 10), hostile as never),
    ).toMatchObject({
      denominationId: 1,
      congregationId: 10,
    });
  });

  it('filters only by denomination in a denomination-wide scope', () => {
    expect(new FakeNotesRepository().where(TenantScope.of(1))).toEqual({
      denominationId: 1,
    });
  });

  it('narrows a denomination-wide scope to one congregation', () => {
    expect(
      new FakeNotesRepository().whereCongregation(TenantScope.of(1), 11),
    ).toEqual({
      denominationId: 1,
      congregationId: 11,
    });
  });

  it('turns a missing row into 404', () => {
    expect(() =>
      new FakeNotesRepository().find(TenantScope.of(1, 10), 1),
    ).toThrow(NotFoundDomainException);
  });
});

// The reusable helper, shown on the repository above.
const repository = new FakeNotesRepository();
describeCrossTenantIsolation('FakeNotesRepository.find', {
  arrange: (owner) => {
    const id = repository.rows.length + 1;
    repository.rows.push({
      id,
      denominationId: owner.denominationId,
      congregationId: owner.requireCongregationId(),
      name: 'note',
    });
    return id;
  },
  act: (scope, id) => Promise.resolve().then(() => repository.find(scope, id)),
});
