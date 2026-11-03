import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UnauthenticatedException } from '../errors/domain.exception.js';
import { Clock } from '../time/bogota-time.js';
import { AccessTokenService } from './access-token.service.js';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import { AuthenticatedRequest, singleHeader } from './request-context.js';
import {
  SESSION_VALIDATOR,
  type SessionValidator,
} from './session-validator.port.js';

const BEARER = /^Bearer ([\w\-.~+/]+=*)$/;

/** Global guard: every route needs a valid access token unless it is marked @Public(). */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly tokens: AccessTokenService,
    @Inject(SESSION_VALIDATOR) private readonly sessions: SessionValidator,
    private readonly clock: Clock,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(
      IS_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = BEARER.exec(
      singleHeader(request, 'authorization') ?? '',
    )?.[1];
    if (!token) {
      throw new UnauthenticatedException();
    }

    const principal = await this.tokens.verify(token);
    // A valid signature is not enough: logout, a password change or a detected theft close the session.
    if (
      !(await this.sessions.isActive(
        principal.userId,
        principal.sessionId,
        this.clock.now(),
      ))
    ) {
      throw new UnauthenticatedException();
    }
    request.principal = principal;
    return true;
  }
}
