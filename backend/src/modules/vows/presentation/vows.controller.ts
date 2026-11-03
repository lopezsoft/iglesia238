import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiOperation,
  ApiProduces,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { CancelVowPledgeUseCase } from '../application/cancel-vow-pledge.use-case.js';
import { CreateVowPledgeUseCase } from '../application/create-vow-pledge.use-case.js';
import { ExportVowPledgesUseCase } from '../application/export-vow-pledges.use-case.js';
import { GetVowPledgeUseCase } from '../application/get-vow-pledge.use-case.js';
import { ListVowPledgesUseCase } from '../application/list-vow-pledges.use-case.js';
import { UpdateVowPledgeUseCase } from '../application/update-vow-pledge.use-case.js';
import {
  GetVowPaymentTargetUseCase,
  ListOpenVowPledgesUseCase,
} from '../application/vow-payment-targets.use-cases.js';
import {
  CancelVowPledgeDto,
  CreateVowPledgeDto,
  ListVowPledgesQueryDto,
  OpenPledgesQueryDto,
  UpdateVowPledgeDto,
  VowFilterQueryDto,
  VowPaymentTargetDto,
  VowPledgeDetailDto,
  VowPledgeOptionDto,
  VowPledgeRowDto,
  VowsOverviewDto,
} from './vows.dto.js';

/**
 * Votos: promesas de aporte con sus abonos, saldo y avance. Lo abonado se calcula con los aportes
 * no anulados de cada promesa; los abonos se registran en Aportes con el tipo Voto.
 */
@ApiTags('accounting - vows')
@ApiTenantScope()
@Controller('accounting/vow-pledges')
export class VowPledgesController {
  constructor(
    private readonly listPledges: ListVowPledgesUseCase,
    private readonly getPledge: GetVowPledgeUseCase,
    private readonly exportPledges: ExportVowPledgesUseCase,
    private readonly createPledge: CreateVowPledgeUseCase,
    private readonly updatePledge: UpdateVowPledgeUseCase,
    private readonly cancelPledge: CancelVowPledgeUseCase,
    private readonly listOpen: ListOpenVowPledgesUseCase,
    private readonly getPaymentTarget: GetVowPaymentTargetUseCase,
  ) {}

  @Get()
  @RequirePermissions('contributions.read')
  @ApiOperation({
    summary:
      'Promesas con filtros y paginación en el servidor, indicadores y conteo por estado',
  })
  @ApiResponse({ status: HttpStatus.OK, type: VowsOverviewDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListVowPledgesQueryDto,
  ) {
    return this.listPledges.execute(tenant, query);
  }

  @Get('export')
  @RequirePermissions('contributions.read')
  @ApiOperation({
    summary:
      'Descarga en CSV las promesas del filtro (queda registrado en la auditoría)',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Archivo CSV (UTF-8 con BOM, separado por punto y coma).',
  })
  async exportCsv(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Query() query: VowFilterQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const file = await this.exportPledges.execute(tenant, query, ipAddress);
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('Cache-Control', 'no-store');
    return file.content;
  }

  @Get('open')
  @RequirePermissions('contributions.write')
  @ApiOperation({
    summary:
      'Promesas activas con saldo de una persona y un tipo (de toda la denominación) para registrar un abono',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [VowPledgeOptionDto] })
  open(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: OpenPledgesQueryDto,
  ) {
    return this.listOpen.execute(
      tenant,
      query.personId,
      query.contributionTypeId,
    );
  }

  @Get(':id/payment-target')
  @RequirePermissions('contributions.write')
  @ApiOperation({
    summary: 'Promesa y persona que "Registrar abono" preselecciona en Aportes',
  })
  @ApiResponse({ status: HttpStatus.OK, type: VowPaymentTargetDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'VOW_PLEDGE_CLOSED',
  })
  paymentTarget(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ) {
    return this.getPaymentTarget.execute(tenant, id);
  }

  @Get(':id')
  @RequirePermissions('contributions.read')
  @ApiOperation({ summary: 'Detalle de una promesa con sus abonos' })
  @ApiResponse({ status: HttpStatus.OK, type: VowPledgeDetailDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND (también si es de otra sede o denominación)',
  })
  detail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ) {
    return this.getPledge.execute(tenant, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('contributions.write')
  @ApiOperation({ summary: 'Registra una promesa de voto (requiere una sede)' })
  @ApiResponse({ status: HttpStatus.CREATED, type: VowPledgeRowDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: CreateVowPledgeDto,
  ) {
    return this.createPledge.execute(tenant, {
      personId: body.personId,
      contributionTypeId: body.contributionTypeId,
      pledgedAmount: body.pledgedAmount,
      pledgedOn: body.pledgedOn,
      dueOn: body.dueOn ?? null,
      description: body.description ?? null,
      ipAddress,
    });
  }

  @Patch(':id')
  @RequirePermissions('contributions.write')
  @ApiOperation({
    summary:
      'Modifica el valor, la fecha límite o las observaciones de una promesa no cancelada',
  })
  @ApiResponse({ status: HttpStatus.OK, type: VowPledgeRowDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'VOW_PLEDGE_CANCELLED',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'VOW_AMOUNT_BELOW_PAID',
  })
  update(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: UpdateVowPledgeDto,
  ) {
    return this.updatePledge.execute(tenant, id, {
      pledgedAmount: body.pledgedAmount,
      dueOn: body.dueOn,
      description: body.description,
      ipAddress,
    });
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('contributions.write')
  @ApiOperation({
    summary: 'Cancela una promesa activa con motivo; sus abonos se conservan',
  })
  @ApiResponse({ status: HttpStatus.OK, type: VowPledgeRowDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'VOW_PLEDGE_CANCELLED, VOW_PLEDGE_FULFILLED',
  })
  cancel(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: CancelVowPledgeDto,
  ) {
    return this.cancelPledge.execute(tenant, id, body.reason, ipAddress);
  }
}
