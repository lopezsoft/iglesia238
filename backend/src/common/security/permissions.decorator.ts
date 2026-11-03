import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSIONS_KEY = 'auth:requiredPermissions';
export const REQUIRED_ANY_PERMISSIONS_KEY = 'auth:requiredAnyPermissions';

/** The user must hold ALL of these permissions in the active scope. */
export const RequirePermissions = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSIONS_KEY, permissions);

/** The user must hold AT LEAST ONE of these permissions in the active scope. */
export const RequireAnyPermission = (
  ...permissions: string[]
): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_ANY_PERMISSIONS_KEY, permissions);
