import { NotFoundDomainException } from '../errors/domain.exception.js';
import { TenantScope } from './tenant-scope.js';

/**
 * Base for repositories of tenant tables. Its helpers take a TenantScope, which cannot be built
 * without a denomination, so a query "without scope" does not compile. The database has composite
 * foreign keys that protect writes; reads are protected only here.
 *
 * Usage inside a repository:
 *   findOne(scope: TenantScope, id: number) {
 *     return this.prisma.member.findFirst({ where: this.scoped(scope, { id }) });
 *   }
 */
export abstract class TenantScopedRepository {
  /** Merges the tenant filter with other conditions. The tenant keys always win over `extra`. */
  protected scoped<T extends object>(
    scope: TenantScope,
    extra?: T,
  ): T & { denominationId: number; congregationId?: number } {
    return { ...extra, ...scope.where() } as T & {
      denominationId: number;
      congregationId?: number;
    };
  }

  /**
   * Same as `scoped`, but the congregation filter applies even to a denomination-wide scope when the
   * caller asks for one congregation, so a denomination administrator can narrow a query to a sede.
   */
  protected scopedToCongregation<T extends object>(
    scope: TenantScope,
    congregationId: number,
    extra?: T,
  ): T & { denominationId: number; congregationId: number } {
    return this.scoped(scope.forCongregation(congregationId), extra) as T & {
      denominationId: number;
      congregationId: number;
    };
  }

  /** A missing row and a row of another tenant look the same: 404, never 403. */
  protected orNotFound<T>(row: T | null | undefined, message?: string): T {
    if (row === null || row === undefined) {
      throw new NotFoundDomainException(message);
    }
    return row;
  }
}
