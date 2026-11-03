import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedRequest } from '../security/request-context.js';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.options.js';
import { RateLimitService } from './rate-limit.service.js';

const UNKNOWN_IP = 'unknown';

/** Applies @RateLimit() per client IP. Fastify already resolves the IP according to TRUST_PROXY. */
@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimit: RateLimitService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const options = this.reflector.getAllAndOverride<
      RateLimitOptions | undefined
    >(RATE_LIMIT_KEY, [context.getHandler(), context.getClass()]);
    if (!options) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    await this.rateLimit.enforce(
      options.name,
      request.ip ?? UNKNOWN_IP,
      { limit: options.limit, windowSeconds: options.windowSeconds },
      options.failure ?? 'open',
    );
    return true;
  }
}
