import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { sendPdf } from '../../../common/http/document-response.js';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import type { Page } from '../../../common/pagination/page.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { ConfirmTitheSettlementUseCase } from '../application/confirm-tithe-settlement.use-case.js';
import { TitheSettlementReportService } from '../application/tithe-settlement-report.service.js';
import { GetTitheOverviewUseCase } from '../application/get-tithe-overview.use-case.js';
import {
  GetTitheSettlementUseCase,
  ListTitheSettlementsUseCase,
} from '../application/list-tithe-settlements.use-case.js';
import { PreviewTitheSettlementUseCase } from '../application/preview-tithe-settlement.use-case.js';
import type {
  TitheOverview,
  TithePreview,
  TitheSettlementDetail,
  TitheSettlementRow,
} from '../application/tithe-settlement.models.js';
import { VoidTitheSettlementUseCase } from '../application/void-tithe-settlement.use-case.js';
import {
  ListTitheSettlementsQueryDto,
  TitheOverviewResponseDto,
  TitheRangeDto,
  TithePreviewResponseDto,
  TitheSettlementDetailResponseDto,
  TitheSettlementPageResponseDto,
  TitheSettlementResponseDto,
  VoidTitheSettlementDto,
} from './tithe-settlements.dto.js';

/** E-05 Liquidación del diezmo: always on one sede, restricted to who holds tithe-settlements.write. */
@ApiTags('tithe-settlements')
@ApiTenantScope()
@RequirePermissions('tithe-settlements.write')
@ApiForbiddenResponse({
  description: 'Sin el permiso tithe-settlements.write en el alcance activo.',
})
@Controller('accounting/tithe-settlements')
export class TitheSettlementsController {
  constructor(
    private readonly getOverview: GetTitheOverviewUseCase,
    private readonly previewSettlement: PreviewTitheSettlementUseCase,
    private readonly confirmSettlement: ConfirmTitheSettlementUseCase,
    private readonly voidSettlement: VoidTitheSettlementUseCase,
    private readonly listSettlements: ListTitheSettlementsUseCase,
    private readonly getSettlement: GetTitheSettlementUseCase,
    private readonly report: TitheSettlementReportService,
  ) {}

  @Get('overview')
  @ApiOperation({
    summary:
      'Porcentaje vigente, último rango liquidado y resumen del año de la sede',
  })
  @ApiOkResponse({ type: TitheOverviewResponseDto })
  overview(@CurrentTenant() tenant: TenantContext): Promise<TitheOverview> {
    return this.getOverview.execute(tenant);
  }

  @Get('preview')
  @ApiOperation({
    summary: 'Calcula el borrador de una liquidación; no guarda nada',
  })
  @ApiOkResponse({ type: TithePreviewResponseDto })
  @ApiConflictResponse({
    description:
      'OVERLAPPING_SETTLEMENT: el rango se solapa con una liquidación emitida.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'RULE_NOT_FOUND: la denominación no tiene porcentajes vigentes.',
  })
  preview(
    @CurrentTenant() tenant: TenantContext,
    @Query() range: TitheRangeDto,
  ): Promise<TithePreview> {
    return this.previewSettlement.execute(tenant, range);
  }

  @Get()
  @ApiOperation({
    summary:
      'Historial de liquidaciones de la sede, la más reciente primero (paginado)',
  })
  @ApiOkResponse({ type: TitheSettlementPageResponseDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListTitheSettlementsQueryDto,
  ): Promise<Page<TitheSettlementRow>> {
    return this.listSettlements.execute(tenant, {
      status: query.status ?? null,
      from: query.from ?? null,
      to: query.to ?? null,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  @Get(':id')
  @ApiOperation({
    summary:
      'Detalle de una liquidación: diezmos incluidos y movimientos de caja generados',
  })
  @ApiOkResponse({ type: TitheSettlementDetailResponseDto })
  @ApiNotFoundResponse({
    description: 'La liquidación no existe o es de otra sede.',
  })
  detail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ): Promise<TitheSettlementDetail> {
    return this.getSettlement.execute(tenant, id);
  }

  @Get(':id/report.pdf')
  @ApiOperation({
    summary: 'Acta de la liquidación lista para firmar y archivar (PDF)',
    description:
      'Membrete de la sede, periodo cubierto, diezmos incluidos, reparto del bruto, dónde quedaron los egresos de caja y firmas. Una liquidación anulada también se imprime, marcada como anulada.',
  })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({
    description: 'La liquidación no existe o es de otra sede.',
  })
  async reportPdf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<StreamableFile> {
    return sendPdf(reply, await this.report.pdf(tenant, id));
  }

  @Post()
  @ApiOperation({
    summary:
      'Confirma la liquidación de un rango: el servidor recalcula, reserva el número LD, liga los diezmos y registra los egresos',
  })
  @ApiCreatedResponse({ type: TitheSettlementResponseDto })
  @ApiConflictResponse({
    description:
      'OVERLAPPING_SETTLEMENT, PERIOD_CLOSED o TITHES_CHANGED (los diezmos cambiaron durante la confirmación).',
  })
  @ApiUnprocessableEntityResponse({
    description: 'NO_TITHES, RULE_NOT_FOUND, PERIOD_NOT_FOUND o FUND_INACTIVE.',
  })
  confirm(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: TitheRangeDto,
    @ClientIp() ip: string | null,
  ): Promise<TitheSettlementRow> {
    return this.confirmSettlement.execute(
      tenant,
      { from: body.from, to: body.to },
      ip,
    );
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Anula la liquidación con un motivo: libera los diezmos y revierte los egresos de caja',
  })
  @ApiOkResponse({ type: TitheSettlementResponseDto })
  @ApiNotFoundResponse({
    description: 'La liquidación no existe o es de otra sede.',
  })
  @ApiConflictResponse({ description: 'ALREADY_VOIDED o PERIOD_CLOSED.' })
  @ApiUnprocessableEntityResponse({ description: 'PERIOD_NOT_FOUND.' })
  voidIt(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: VoidTitheSettlementDto,
    @ClientIp() ip: string | null,
  ): Promise<TitheSettlementRow> {
    return this.voidSettlement.execute(tenant, id, body.reason, ip);
  }
}
