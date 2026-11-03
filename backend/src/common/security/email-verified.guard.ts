import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ForbiddenDomainException,
  UnauthenticatedException,
} from '../errors/domain.exception.js';
import { ALLOW_UNVERIFIED_EMAIL_KEY } from './allow-unverified-email.decorator.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AuthenticatedRequest } from './request-context.js';
import {
  SESSION_VALIDATOR,
  type SessionValidator,
} from './session-validator.port.js';

export const EMAIL_NOT_VERIFIED_CODE = 'EMAIL_NOT_VERIFIED';

/**
 * Global guard, between authentication and permissions. A user who registered by themselves can sign
 * in right away, but until the e-mail is confirmed every authenticated route is closed to them except
 * the ones marked with @AllowUnverifiedEmail() (the /auth/* account routes). Public routes are not
 * affected. The answer is the same whatever the permissions of the route are.
 */
@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_VALIDATOR) private readonly sessions: SessionValidator,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    if (
      this.reflector.getAllAndOverride<boolean | undefined>(
        IS_PUBLIC_KEY,
        targets,
      ) ||
      this.reflector.getAllAndOverride<boolean | undefined>(
        ALLOW_UNVERIFIED_EMAIL_KEY,
        targets,
      )
    ) {
      return true;
    }

    const { principal } = context
      .switchToHttp()
      .getRequest<AuthenticatedRequest>();
    if (!principal) {
      throw new UnauthenticatedException();
    }
    if (!(await this.sessions.isEmailVerified(principal.userId))) {
      throw new ForbiddenDomainException(
        'Confirma tu correo electrónico para continuar. Te enviamos un enlace de confirmación.',
        EMAIL_NOT_VERIFIED_CODE,
      );
    }
    return true;
  }
}
