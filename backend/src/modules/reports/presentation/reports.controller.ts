import { Controller, Get, Query, Res } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { ExportContributionsDetailUseCase } from '../application/export-contributions-detail.use-case.js';
import { GetFinancialReportUseCase } from '../application/get-financial-report.use-case.js';
import { GetReportOptionsUseCase } from '../application/get-report-options.use-case.js';
import type {
  FinancialReport,
  ReportOptions,
  ReportQuery,
} from '../application/report.models.js';
import {
  FinancialReportResponseDto,
  ReportOptionsResponseDto,
  ReportQueryDto,
} from './reports.dto.js';

function toQuery(dto: ReportQueryDto): ReportQuery {
  return {
    from: dto.from,
    to: dto.to,
    fundId: dto.fundId ?? null,
    congregationId: dto.congregationId ?? null,
  };
}

/** E-07 Reportes financieros: aggregated views over the accounting context, restricted to reports.read. */
@ApiTags('reports')
@ApiTenantScope()
@RequirePermissions('reports.read')
@ApiForbiddenResponse({
  description: 'Sin el permiso reports.read en el alcance activo.',
})
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly getOptions: GetReportOptionsUseCase,
    private readonly getReport: GetFinancialReportUseCase,
    private readonly exportDetail: ExportContributionsDetailUseCase,
  ) {}

  @Get('options')
  @ApiOperation({
    summary:
      'Alcance del reporte, fondos y sedes disponibles, y la fecha de hoy',
  })
  @ApiOkResponse({ type: ReportOptionsResponseDto })
  options(@CurrentTenant() tenant: TenantContext): Promise<ReportOptions> {
    return this.getOptions.execute(tenant);
  }

  @Get('financial')
  @ApiOperation({
    summary:
      'Ingresos, egresos, flujo mensual, saldos por fondo, estado de resultados por cuenta, aportes por tipo y desglose por sede',
  })
  @ApiOkResponse({ type: FinancialReportResponseDto })
  @ApiBadRequestResponse({ description: 'INVALID_RANGE o RANGE_CROSSES_YEAR.' })
  @ApiNotFoundResponse({
    description: 'FUND_NOT_FOUND o la sede no existe en el alcance.',
  })
  financial(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ReportQueryDto,
  ): Promise<FinancialReport> {
    return this.getReport.execute(tenant, toQuery(query));
  }

  @Get('contributions-detail.csv')
  @RequirePermissions('reports.read', 'contributions.write')
  @ApiOperation({
    summary:
      'Exporta el detalle de aportes en CSV (UTF-8 con BOM, separador ;). Incluye nombres: exige contributions.write y queda en auditoría',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV.' })
  @ApiBadRequestResponse({ description: 'INVALID_RANGE o RANGE_CROSSES_YEAR.' })
  @ApiUnprocessableEntityResponse({
    description: 'EXPORT_TOO_LARGE: acorta el rango.',
  })
  async contributionsDetail(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ReportQueryDto,
    @ClientIp() ip: string | null,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const { fileName, content } = await this.exportDetail.execute(
      tenant,
      toQuery(query),
      ip,
    );
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${fileName}"`);
    return content;
  }
}
