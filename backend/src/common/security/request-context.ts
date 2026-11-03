import type { TenantContext } from '../tenancy/tenant-context.js';

/** What the access token proves: who the user is and which session issued it. */
export interface Principal {
  readonly userId: number;
  readonly sessionId: string;
}

/** The parts of the HTTP request the guards read and write. Keeps them independent of Fastify. */
export interface AuthenticatedRequest {
  headers: Record<string, string | string[] | undefined>;
  ip?: string;
  principal?: Principal;
  tenant?: TenantContext;
}

export function singleHeader(
  request: AuthenticatedRequest,
  name: string,
): string | undefined {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}
