import type { TenantScope } from '../tenancy/tenant-scope.js';

export const CONGREGATION_LOOKUP = Symbol('CONGREGATION_LOOKUP');

/** Reads the display name of a congregation of the denomination (null when it is not found there). */
export interface CongregationLookup {
  nameOf(scope: TenantScope, congregationId: number): Promise<string | null>;
}

/** Label shown when the scope covers every congregation of the denomination. */
export const ALL_CONGREGATIONS_LABEL = 'todas las sedes';
