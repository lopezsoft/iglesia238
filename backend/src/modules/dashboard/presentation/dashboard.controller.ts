import { Controller, Get, HttpStatus, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/security/current-user.decorators.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { DEFAULT_DASHBOARD_PERIOD } from '../application/dashboard.types.js';
import { GetDashboardSummaryUseCase } from '../application/get-dashboard-summary.use-case.js';
import {
  DashboardQueryDto,
  DashboardSummaryResponseDto,
} from './dashboard.dto.js';

@ApiTags('dashboard')
@ApiTenantScope()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly summary: GetDashboardSummaryUseCase) {}

  @Get('summary')
  @ApiOperation({
    summary: 'Resumen del inicio según el alcance y el periodo',
    description:
      'Cada área aporta sus widgets (KPI, paneles, listas, tendencias) solo si el rol del alcance activo tiene el permiso. Los widgets que fallan se listan en `unavailable`.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: DashboardSummaryResponseDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Falta X-Scope o el periodo no es válido.',
  })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'El alcance no pertenece al usuario.',
  })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: DashboardQueryDto,
  ): Promise<DashboardSummaryResponseDto> {
    return this.summary.execute(
      tenant,
      query.period ?? DEFAULT_DASHBOARD_PERIOD,
    );
  }
}
