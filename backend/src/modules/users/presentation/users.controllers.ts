import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  InviteUserUseCase,
  IssueUserLinkUseCase,
} from '../application/invitations.use-cases.js';
import {
  GrantRoleUseCase,
  RevokeRoleUseCase,
} from '../application/role-commands.use-cases.js';
import {
  GetGrantContextUseCase,
  ListRolesUseCase,
  ListUsersUseCase,
} from '../application/user-queries.use-cases.js';
import {
  AssignmentDto,
  GrantContextDto,
  GrantRoleBodyDto,
  InvitationResultDto,
  InviteUserBodyDto,
  ListUsersQueryDto,
  ManagedUserPageDto,
  OneTimeLinkDto,
  RoleMatrixDto,
} from './users.dto.js';

@ApiTags('users')
@ApiTenantScope()
@RequirePermissions('users.manage')
@Controller('users')
export class UsersController {
  constructor(
    private readonly listUsers: ListUsersUseCase,
    private readonly grantContext: GetGrantContextUseCase,
    private readonly grantRole: GrantRoleUseCase,
    private readonly inviteUser: InviteUserUseCase,
    private readonly issueLink: IssueUserLinkUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista usuarios con paginación en el servidor. La plataforma ve todos; el administrador de una denominación, quienes tienen o tuvieron un rol en ella',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ManagedUserPageDto })
  list(
    @CurrentTenant() context: TenantContext,
    @Query() query: ListUsersQueryDto,
  ) {
    return this.listUsers.execute(context, {
      search: query.search,
      role: query.role ?? null,
      status: query.status ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('grant-context')
  @ApiOperation({
    summary:
      'Roles y alcances que el administrador puede otorgar (misma política que otorgar)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: GrantContextDto })
  context(@CurrentTenant() context: TenantContext) {
    return this.grantContext.execute(context);
  }

  @Post('invitations')
  // The answer for an e-mail that already exists differs from a new one: slow down anyone probing addresses.
  @RateLimit({ name: 'users-invite', limit: 20, windowSeconds: 3600 })
  @ApiOperation({
    summary:
      'Invita a un usuario con su primer rol. Devuelve el enlace de un solo uso (solo a quien invita)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: InvitationResultDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'DUPLICATE_EMAIL (el correo ya tiene una cuenta; no se vincula) o SELF_GRANT',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  invite(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: InviteUserBodyDto,
  ) {
    return this.inviteUser.execute({
      context,
      ipAddress,
      displayName: body.displayName,
      email: body.email,
      role: body.role,
      denominationId: body.denominationId ?? null,
      congregationId: body.congregationId ?? null,
    });
  }

  @Post(':userId/roles')
  @ApiOperation({ summary: 'Otorga un rol a un usuario' })
  @ApiResponse({ status: HttpStatus.CREATED, type: AssignmentDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'DUPLICATE_ROLE o SELF_GRANT',
  })
  grant(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('userId', PositiveIntPipe) userId: number,
    @Body() body: GrantRoleBodyDto,
  ) {
    return this.grantRole.execute({
      context,
      ipAddress,
      userId,
      role: body.role,
      denominationId: body.denominationId ?? null,
      congregationId: body.congregationId ?? null,
    });
  }

  @Post(':userId/reset-link')
  @ApiOperation({
    summary:
      'Genera un enlace de un solo uso para que la persona cree su contraseña (invitación de nuevo o recuperación)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: OneTimeLinkDto })
  resetLink(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('userId', PositiveIntPipe) userId: number,
  ) {
    return this.issueLink.execute({ context, ipAddress, userId });
  }
}

@ApiTags('users')
@ApiTenantScope()
@RequirePermissions('users.manage')
@Controller('user-roles')
export class UserRolesController {
  constructor(private readonly revokeRole: RevokeRoleUseCase) {}

  @Post(':assignmentId/revoke')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Revoca una asignación de rol (la fila se conserva). Aplica de inmediato',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AssignmentDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'ALREADY_REVOKED o SELF_REVOKE',
  })
  revoke(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('assignmentId', PositiveIntPipe) assignmentId: number,
  ) {
    return this.revokeRole.execute({ context, ipAddress, assignmentId });
  }
}

@ApiTags('users')
@ApiTenantScope()
@RequirePermissions('users.manage')
@Controller('roles')
export class RolesController {
  constructor(private readonly listRoles: ListRolesUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Matriz de roles y permisos, leída de la base de datos',
  })
  @ApiResponse({ status: HttpStatus.OK, type: RoleMatrixDto })
  list() {
    return this.listRoles.execute();
  }
}
