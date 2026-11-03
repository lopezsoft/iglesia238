import {
  ErrorCode,
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../errors/domain.exception.js';
import { ScopeKind } from './scope-key.js';
import { TenantScope } from './tenant-scope.js';

export interface TenantContextData {
  userId: number;
  sessionId: string;
  scopeKey: string;
  kind: ScopeKind;
  denominationId: number | null;
  congregationId: number | null;
  roleCodes: readonly string[];
  permissions: ReadonlySet<string>;
}

/**
 * Who is acting and where, for one request. It is rebuilt on every request from the active role
 * assignments, so a revoked role stops working immediately.
 */
export class TenantContext implements TenantContextData {
  readonly userId: number;
  readonly sessionId: string;
  readonly scopeKey: string;
  readonly kind: ScopeKind;
  readonly denominationId: number | null;
  readonly congregationId: number | null;
  readonly roleCodes: readonly string[];
  readonly permissions: ReadonlySet<string>;

  constructor(data: TenantContextData) {
    this.userId = data.userId;
    this.sessionId = data.sessionId;
    this.scopeKey = data.scopeKey;
    this.kind = data.kind;
    this.denominationId = data.denominationId;
    this.congregationId = data.congregationId;
    this.roleCodes = data.roleCodes;
    this.permissions = data.permissions;
  }

  has(permission: string): boolean {
    return this.permissions.has(permission);
  }

  hasAll(...permissions: readonly string[]): boolean {
    return permissions.every((permission) => this.permissions.has(permission));
  }

  hasAny(...permissions: readonly string[]): boolean {
    return permissions.some((permission) => this.permissions.has(permission));
  }

  /** Scope for repositories. The platform scope never reaches tenant tables. */
  tenantScope(): TenantScope {
    if (this.denominationId === null) {
      throw new ForbiddenDomainException(
        'Esta acción no está disponible en el alcance de plataforma.',
        ErrorCode.PLATFORM_SCOPE_NOT_ALLOWED,
      );
    }
    return TenantScope.of(this.denominationId, this.congregationId);
  }

  /**
   * Scope of one congregation. In a congregation scope the congregation is fixed and a different
   * requested id answers 404; in a denomination scope the id must be given (the query then filters
   * by it, so a congregation of another denomination is simply not found).
   */
  congregationScope(requestedCongregationId?: number | null): TenantScope {
    const base = this.tenantScope();
    if (base.congregationId !== null) {
      if (
        requestedCongregationId !== undefined &&
        requestedCongregationId !== null &&
        requestedCongregationId !== base.congregationId
      ) {
        throw new NotFoundDomainException();
      }
      return base;
    }
    if (
      requestedCongregationId === undefined ||
      requestedCongregationId === null
    ) {
      throw new InvalidInputException(
        'Indica la sede.',
        ErrorCode.CONGREGATION_SCOPE_REQUIRED,
      );
    }
    return base.forCongregation(requestedCongregationId);
  }
}
