import { applyDecorators, SetMetadata, UseGuards } from '@nestjs/common';
import { RATE_LIMIT_KEY, RateLimitOptions } from './rate-limit.options.js';
import { RateLimitGuard } from './rate-limit.guard.js';

/** Limits the requests per client IP on a route. Limits per account are applied in the use case. */
export const RateLimit = (
  options: RateLimitOptions,
): MethodDecorator & ClassDecorator =>
  applyDecorators(
    SetMetadata(RATE_LIMIT_KEY, options),
    UseGuards(RateLimitGuard),
  );
