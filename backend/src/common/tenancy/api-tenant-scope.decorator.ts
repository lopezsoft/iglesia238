import { applyDecorators } from '@nestjs/common';
import { ApiBearerAuth, ApiHeader } from '@nestjs/swagger';

/** Swagger: the route needs the access token and the X-Scope header. */
export const ApiTenantScope = (): MethodDecorator & ClassDecorator =>
  applyDecorators(
    ApiBearerAuth(),
    ApiHeader({
      name: 'X-Scope',
      required: true,
      description:
        'Alcance activo, con el formato de UserRole.scopeKey: P (plataforma), D:<denominationId> o C:<congregationId>.',
      example: 'C:12',
    }),
  );
