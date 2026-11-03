/**
 * The pair of ids that every query on business tables must carry. It can only be built through the
 * factory methods, so a repository that asks for a TenantScope cannot be called without one.
 */
export class TenantScope {
  private constructor(
    readonly denominationId: number,
    readonly congregationId: number | null,
  ) {
    Object.freeze(this);
  }

  static of(denominationId: number, congregationId: number | null = null) {
    assertId(denominationId, 'denominationId');
    if (congregationId !== null) {
      assertId(congregationId, 'congregationId');
    }
    return new TenantScope(denominationId, congregationId);
  }

  /** Same denomination, restricted to one of its congregations. */
  forCongregation(congregationId: number): TenantScope {
    return TenantScope.of(this.denominationId, congregationId);
  }

  /** Prisma `where` fragment: always the denomination, and the congregation when the scope has one. */
  where(): { denominationId: number; congregationId?: number } {
    return this.congregationId === null
      ? { denominationId: this.denominationId }
      : {
          denominationId: this.denominationId,
          congregationId: this.congregationId,
        };
  }

  /** Congregation of this scope; for operations that only make sense inside one congregation. */
  requireCongregationId(): number {
    if (this.congregationId === null) {
      throw new Error('This operation requires a congregation scope');
    }
    return this.congregationId;
  }
}

function assertId(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
}
