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
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { CreateDenominationUseCase } from '../application/create-denomination.use-case.js';
import {
  GetDenominationStatsUseCase,
  ListDenominationsUseCase,
} from '../application/list-denominations.use-case.js';
import {
  RenameDenominationUseCase,
  SetDenominationStatusUseCase,
} from '../application/update-denomination.use-case.js';
import {
  DenominationNameBodyDto,
  DenominationPageDto,
  DenominationStatsDto,
  DenominationStatusBodyDto,
  DenominationSummaryDto,
  ListDenominationsQueryDto,
} from './denominations.dto.js';

/** Platform administration of denominations. The platform sees structure only, never members or finances. */
@ApiTags('denominations')
@ApiTenantScope()
@RequirePermissions('denominations.manage')
@Controller('platform/denominations')
export class DenominationsController {
  constructor(
    private readonly listDenominations: ListDenominationsUseCase,
    private readonly getStats: GetDenominationStatsUseCase,
    private readonly createDenomination: CreateDenominationUseCase,
    private readonly renameDenomination: RenameDenominationUseCase,
    private readonly setStatus: SetDenominationStatusUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las denominaciones con paginación en el servidor',
  })
  @ApiResponse({ status: HttpStatus.OK, type: DenominationPageDto })
  list(
    @CurrentTenant() context: TenantContext,
    @Query() query: ListDenominationsQueryDto,
  ) {
    return this.listDenominations.execute(context, query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Totales para las tarjetas de resumen' })
  @ApiResponse({ status: HttpStatus.OK, type: DenominationStatsDto })
  stats(@CurrentTenant() context: TenantContext) {
    return this.getStats.execute(context);
  }

  @Post()
  @ApiOperation({
    summary:
      'Crea una denominación con su plantilla inicial (fondo, plan de cuentas, tipos de aporte, tipos de certificado, grados, cargos y política en borrador)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: DenominationSummaryDto })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'DUPLICATE_NAME' })
  create(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: DenominationNameBodyDto,
  ) {
    return this.createDenomination.execute({
      context,
      name: body.name,
      ipAddress,
    });
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Cambia el nombre de la denominación' })
  @ApiResponse({ status: HttpStatus.OK, type: DenominationSummaryDto })
  rename(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: DenominationNameBodyDto,
  ) {
    return this.renameDenomination.execute({
      context,
      id,
      name: body.name,
      ipAddress,
    });
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Activa o desactiva la denominación. Al desactivarla, sus usuarios dejan de poder operar en ella',
  })
  @ApiResponse({ status: HttpStatus.OK, type: DenominationSummaryDto })
  setActive(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: DenominationStatusBodyDto,
  ) {
    return this.setStatus.execute({
      context,
      id,
      isActive: body.isActive,
      ipAddress,
    });
  }
}
