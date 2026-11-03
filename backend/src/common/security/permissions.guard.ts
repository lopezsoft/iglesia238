import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ErrorCode,
  ForbiddenDomainException,
  InvalidInputException,
  UnauthenticatedException,
} from '../errors/domain.exception.js';
import { SCOPE_HEADER } from '../tenancy/scope-key.js';
import { TenantContextResolver } from '../tenancy/tenant-context.resolver.js';
import {
  REQUIRED_ANY_PERMISSIONS_KEY,
  REQUIRED_PERMISSIONS_KEY,
} from './permissions.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { AuthenticatedRequest, singleHeader } from './request-context.js';

/**
 * Second global guard, after JwtAuthGuard. It validates the X-Scope header against the active role
 * assignments of the user and checks the permissions the route declares. A route that declares none
 * only needs authentication; if the client still sends X-Scope, it is validated and made available.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly resolver: TenantContextResolver,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      )
    ) {
      return true;
    }

    const all =
      this.reflector.getAllAndOverride<string[] | undefined>(
        REQUIRED_PERMISSIONS_KEY,
        targets,
      ) ?? [];
    const any =
      this.reflector.getAllAndOverride<string[] | undefined>(
        REQUIRED_ANY_PERMISSIONS_KEY,
        targets,
      ) ?? [];

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!request.principal) {
      throw new UnauthenticatedException();
    }

    const rawScope = singleHeader(request, SCOPE_HEADER);
    if (rawScope === undefined || rawScope === '') {
      if (all.length > 0 || any.length > 0) {
        throw new InvalidInputException(
          'Falta el alcance de la petición.',
          ErrorCode.SCOPE_REQUIRED,
        );
      }
      return true;
    }

    const tenant = await this.resolver.resolve({
      userId: request.principal.userId,
      sessionId: request.principal.sessionId,
      rawScope,
    });
    request.tenant = tenant;

    if (!tenant.hasAll(...all) || (any.length > 0 && !tenant.hasAny(...any))) {
      throw new ForbiddenDomainException();
    }
    return true;
  }
}
