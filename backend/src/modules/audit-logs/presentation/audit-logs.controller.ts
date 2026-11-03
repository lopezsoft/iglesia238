import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  GetAuditFilterOptionsUseCase,
  ListAuditLogsUseCase,
} from '../application/audit-logs.use-cases.js';
import {
  AuditFilterOptionsDto,
  AuditPageDto,
  ListAuditLogsQueryDto,
} from './audit-logs.dto.js';

/** Read-only. The log is written by the use cases of every module, never through the API. */
@ApiTags('audit-logs')
@ApiTenantScope()
@RequirePermissions('audit-logs.read')
@Controller('audit-logs')
export class AuditLogsController {
  constructor(
    private readonly listAuditLogs: ListAuditLogsUseCase,
    private readonly filterOptions: GetAuditFilterOptionsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Consulta la auditoría, la más reciente primero. La plataforma ve todo; una denominación, lo suyo. Las direcciones IP salen enmascaradas',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AuditPageDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'INVALID_RANGE o RANGE_TOO_LONG (máximo 90 días)',
  })
  list(
    @CurrentTenant() context: TenantContext,
    @Query() query: ListAuditLogsQueryDto,
  ) {
    return this.listAuditLogs.execute(context, {
      from: query.from ?? null,
      to: query.to ?? null,
      userId: query.userId ?? null,
      action: query.action ?? null,
      entity: query.entity ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get('filter-options')
  @ApiOperation({
    summary:
      'Usuarios, acciones y entidades con registros recientes para los filtros',
  })
  @ApiResponse({ status: HttpStatus.OK, type: AuditFilterOptionsDto })
  options(@CurrentTenant() context: TenantContext) {
    return this.filterOptions.execute(context);
  }
}
