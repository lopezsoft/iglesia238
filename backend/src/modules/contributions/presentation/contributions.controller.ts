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
import { ExportContributionsUseCase } from '../application/export-contributions.use-case.js';
import { GetContributionFormOptionsUseCase } from '../application/get-contribution-form-options.use-case.js';
import { GetContributionUseCase } from '../application/get-contribution.use-case.js';
import { ListContributionsUseCase } from '../application/list-contributions.use-case.js';
import { RecordContributionUseCase } from '../application/record-contribution.use-case.js';
import { SearchContributorsUseCase } from '../application/search-contributors.use-case.js';
import { VoidContributionUseCase } from '../application/void-contribution.use-case.js';
import {
  ContributionDetailDto,
  ContributionFilterQueryDto,
  ContributionFormOptionsDto,
  ContributionListingDto,
  ContributionRowDto,
  ListContributionsQueryDto,
  PersonOptionDto,
  RecordContributionDto,
  SearchContributorsQueryDto,
  VoidContributionDto,
} from './contributions.dto.js';

/**
 * Aportes: diezmos, ofrendas, primicias y abonos a votos. Reading needs contributions.read;
 * recording and voiding need contributions.write and a sede scope. Nothing is deleted: voiding keeps the row.
 */
@ApiTags('accounting - contributions')
@ApiTenantScope()
@Controller('accounting/contributions')
export class ContributionsController {
  constructor(
    private readonly getFormOptions: GetContributionFormOptionsUseCase,
    private readonly listContributions: ListContributionsUseCase,
    private readonly getContribution: GetContributionUseCase,
    private readonly exportContributions: ExportContributionsUseCase,
    private readonly recordContribution: RecordContributionUseCase,
    private readonly voidContribution: VoidContributionUseCase,
  ) {}

  @Get('form-options')
  @RequirePermissions('contributions.read')
  @ApiOperation({
    summary:
      'Tipos, periodos, fechas permitidas, rangos de diezmo liquidados y próximo recibo para el formulario',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ContributionFormOptionsDto })
  formOptions(@CurrentTenant() tenant: TenantContext) {
    return this.getFormOptions.execute(tenant);
  }

  @Get('export')
  @RequirePermissions('contributions.read')
  @ApiOperation({
    summary:
      'Descarga en CSV los aportes del filtro (queda registrado en la auditoría)',
  })
  @ApiProduces('text/csv')
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Archivo CSV (UTF-8 con BOM, separado por punto y coma).',
  })
  async exportCsv(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Query() query: ContributionFilterQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const file = await this.exportContributions.execute(
      tenant,
      query,
      ipAddress,
    );
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${file.filename}"`)
      .header('Cache-Control', 'no-store');
    return file.content;
  }

  @Get()
  @RequirePermissions('contributions.read')
  @ApiOperation({
    summary:
      'Aportes de un mes o rango, con filtros, paginación en el servidor y totales por categoría',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ContributionListingDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListContributionsQueryDto,
  ) {
    return this.listContributions.execute(tenant, query);
  }

  @Get(':id')
  @RequirePermissions('contributions.read')
  @ApiOperation({
    summary:
      'Detalle de un aporte: quién lo registró, recibo, consolidación y liquidación',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ContributionDetailDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'NOT_FOUND (también si es de otra sede o denominación)',
  })
  detail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ) {
    return this.getContribution.execute(tenant, id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions('contributions.write')
  @ApiOperation({
    summary: 'Registra un aporte y emite su recibo REC (requiere una sede)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: ContributionRowDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'INVALID_AMOUNT, INVALID_DATE, FUTURE_DATE, REFERENCE_REQUIRED, VOW_REQUIRES_PERSON, VOW_PLEDGE_REQUIRED, VOW_PLEDGE_NOT_ALLOWED, CONGREGATION_SCOPE_REQUIRED',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'PERIOD_CLOSED, TITHE_RANGE_SETTLED, VOW_PLEDGE_CLOSED, VOW_PAYMENT_EXCEEDS_BALANCE',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'TYPE_INACTIVE, ACCOUNT_NOT_POSTABLE, PERIOD_NOT_FOUND, VOW_PLEDGE_MISMATCH',
  })
  record(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: RecordContributionDto,
  ) {
    return this.recordContribution.execute(tenant, {
      contributionTypeId: body.contributionTypeId,
      personId: body.personId ?? null,
      receivedOn: body.receivedOn,
      amount: body.amount,
      paymentMethod: body.paymentMethod,
      paymentReference: body.paymentReference ?? null,
      vowPledgeId: body.vowPledgeId ?? null,
      notes: body.notes ?? null,
      ipAddress,
    });
  }

  @Post(':id/void')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('contributions.write')
  @ApiOperation({
    summary:
      'Anula un aporte con motivo: se conserva el registro y se anula su recibo',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ContributionRowDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'ALREADY_VOIDED, CONTRIBUTION_SETTLED, CONTRIBUTION_CONSOLIDATED',
  })
  voidOne(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: VoidContributionDto,
  ) {
    return this.voidContribution.execute(tenant, id, body.reason, ipAddress);
  }
}

/**
 * Buscador de aportantes para Aportes y Votos. Tiene su propia regla de permisos: el tesorero tiene
 * contributions.read pero no members.read. El documento sale siempre enmascarado.
 */
@ApiTags('accounting - contributions')
@ApiTenantScope()
@Controller('accounting/contributors')
export class ContributorsController {
  constructor(private readonly searchContributors: SearchContributorsUseCase) {}

  @Get('search')
  @RequirePermissions('contributions.read')
  @ApiOperation({
    summary:
      'Busca miembros por nombre, documento o código (máximo 8, los de la sede primero)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [PersonOptionDto] })
  search(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: SearchContributorsQueryDto,
  ) {
    return this.searchContributors.execute(tenant, query.q);
  }
}
