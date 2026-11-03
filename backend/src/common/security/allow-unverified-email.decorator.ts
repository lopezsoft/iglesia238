import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNVERIFIED_EMAIL_KEY = 'auth:allowUnverifiedEmail';

/**
 * Lets a signed-in user whose e-mail is not confirmed yet use the route. Every other authenticated
 * route answers 403 EMAIL_NOT_VERIFIED: only the account routes (/auth/*) are marked with it.
 */
export const AllowUnverifiedEmail = (): MethodDecorator & ClassDecorator =>
  SetMetadata(ALLOW_UNVERIFIED_EMAIL_KEY, true);
