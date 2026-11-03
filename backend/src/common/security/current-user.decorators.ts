import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import {
  ErrorCode,
  InvalidInputException,
  UnauthenticatedException,
} from '../errors/domain.exception.js';
import type { TenantContext } from '../tenancy/tenant-context.js';
import { AuthenticatedRequest, Principal } from './request-context.js';

/** The authenticated user of the request (from the access token). */
export const CurrentPrincipal = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal => {
    const { principal } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (!principal) {
      throw new UnauthenticatedException();
    }
    return principal;
  },
);

/** The tenant context of the request. The route needs permissions, or the client sent X-Scope. */
export const CurrentTenant = createParamDecorator(
  (_data: unknown, context: ExecutionContext): TenantContext => {
    const { tenant } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (!tenant) {
      throw new InvalidInputException(
        'Falta el alcance de la petición.',
        ErrorCode.SCOPE_REQUIRED,
      );
    }
    return tenant;
  },
);

/** Client IP as Fastify resolved it (it honors TRUST_PROXY). */
export const ClientIp = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string | null =>
    context.switchToHttp().getRequest<AuthenticatedRequest>().ip ?? null,
);
