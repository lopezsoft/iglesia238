import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  AccountingPermissions,
  CATALOG_READ_PERMISSIONS,
} from '../../../common/accounting/accounting-permissions.js';
import { CurrentTenant } from '../../../common/security/current-user.decorators.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { AccountingPeriodsService } from '../application/accounting-periods.service.js';
import { AccountsService } from '../application/accounts.service.js';
import { ContributionTypesService } from '../application/contribution-types.service.js';
import { FundsService } from '../application/funds.service.js';
import { SetupOverviewService } from '../application/setup-overview.service.js';
import { TitheRulesService } from '../application/tithe-rules.service.js';
import {
  AccountDto,
  ContributionTypeDto,
  CreateAccountDto,
  FundDto,
  OpenPeriodDto,
  PeriodDto,
  SaveContributionTypeDto,
  SaveFundDto,
  SaveTitheRuleDto,
  SetActiveDto,
  SetupOverviewDto,
  TitheRuleDto,
  UpdateAccountDto,
} from './setup.dto.js';

const MANAGE = AccountingPermissions.budgetsManage;

@ApiTags('accounting-setup')
@ApiTenantScope()
@Controller('accounting/setup')
export class SetupOverviewController {
  constructor(private readonly overview: SetupOverviewService) {}

  @Get('overview')
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  @ApiOperation({
    summary:
      'Resumen de la configuración contable de la sede o la denominación',
  })
  @ApiOkResponse({ type: SetupOverviewDto })
  get(@CurrentTenant() tenant: TenantContext): Promise<SetupOverviewDto> {
    return this.overview.get(tenant);
  }
}

@ApiTags('accounting-setup')
@ApiTenantScope()
@Controller('accounting/funds')
export class FundsController {
  constructor(private readonly funds: FundsService) {}

  @Get()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  @ApiOperation({
    summary: 'Fondos de la denominación con el saldo inicial del año',
  })
  @ApiOkResponse({ type: FundDto, isArray: true })
  list(@CurrentTenant() tenant: TenantContext): Promise<FundDto[]> {
    return this.funds.list(tenant);
  }

  @Post()
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary: 'Crea un fondo (con saldo inicial si hay una sede activa)',
  })
  @ApiCreatedResponse({ type: FundDto })
  @ApiConflictResponse({
    description: 'Nombre repetido o saldo inicial bloqueado',
  })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: SaveFundDto,
  ): Promise<FundDto> {
    return this.funds.create(tenant, body);
  }

  @Put(':id')
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary: 'Edita un fondo y, opcionalmente, su saldo inicial del año',
  })
  @ApiOkResponse({ type: FundDto })
  @ApiNotFoundResponse({ description: 'El fondo no existe en la denominación' })
  @ApiConflictResponse({
    description: 'Nombre repetido, fondo sugerido o saldo bloqueado',
  })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SaveFundDto,
  ): Promise<FundDto> {
    return this.funds.update(tenant, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary: 'Elimina un fondo sin movimientos, presupuesto ni saldos',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'El fondo está en uso' })
  remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.funds.remove(tenant, id);
  }
}

@ApiTags('accounting-setup')
@ApiTenantScope()
@Controller('accounting/accounts')
export class AccountsController {
  constructor(private readonly accounts: AccountsService) {}

  @Get()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  @ApiOperation({ summary: 'Plan de cuentas en orden de árbol' })
  @ApiOkResponse({ type: AccountDto, isArray: true })
  list(@CurrentTenant() tenant: TenantContext): Promise<AccountDto[]> {
    return this.accounts.list(tenant);
  }

  @Post()
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Crea una cuenta o subcuenta' })
  @ApiCreatedResponse({ type: AccountDto })
  @ApiConflictResponse({
    description: 'Código repetido o cuenta padre con movimientos',
  })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateAccountDto,
  ): Promise<AccountDto> {
    return this.accounts.create(tenant, body);
  }

  @Put(':id')
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary:
      'Edita código, nombre, imputabilidad y fondo sugerido de una cuenta',
  })
  @ApiOkResponse({ type: AccountDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: UpdateAccountDto,
  ): Promise<AccountDto> {
    return this.accounts.update(tenant, id, body);
  }

  @Patch(':id/active')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Activa o desactiva una cuenta' })
  @ApiOkResponse({ type: AccountDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Tiene tipos de aporte activos' })
  setActive(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetActiveDto,
  ): Promise<AccountDto> {
    return this.accounts.setActive(tenant, id, body.isActive);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary:
      'Elimina una cuenta sin subcuentas, movimientos ni tipos de aporte',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiConflictResponse()
  remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.accounts.remove(tenant, id);
  }
}

@ApiTags('accounting-setup')
@ApiTenantScope()
@Controller('accounting/contribution-types')
export class ContributionTypesController {
  constructor(private readonly types: ContributionTypesService) {}

  @Get()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  @ApiOperation({ summary: 'Tipos de aporte de la denominación' })
  @ApiOkResponse({ type: ContributionTypeDto, isArray: true })
  list(@CurrentTenant() tenant: TenantContext): Promise<ContributionTypeDto[]> {
    return this.types.list(tenant);
  }

  @Post()
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Crea un tipo de aporte (nace activo)' })
  @ApiCreatedResponse({ type: ContributionTypeDto })
  @ApiConflictResponse({ description: 'Código repetido' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: SaveContributionTypeDto,
  ): Promise<ContributionTypeDto> {
    return this.types.create(tenant, body);
  }

  @Put(':id')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Edita un tipo de aporte' })
  @ApiOkResponse({ type: ContributionTypeDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({
    description: 'La categoría no cambia si ya hay aportes',
  })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SaveContributionTypeDto,
  ): Promise<ContributionTypeDto> {
    return this.types.update(tenant, id, body);
  }

  @Patch(':id/active')
  @RequirePermissions(MANAGE)
  @ApiOperation({ summary: 'Activa o desactiva un tipo de aporte' })
  @ApiOkResponse({ type: ContributionTypeDto })
  @ApiNotFoundResponse()
  setActive(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SetActiveDto,
  ): Promise<ContributionTypeDto> {
    return this.types.setActive(tenant, id, body.isActive);
  }
}

@ApiTags('accounting-setup')
@ApiTenantScope()
@Controller('accounting/periods')
export class AccountingPeriodsController {
  constructor(private readonly periods: AccountingPeriodsService) {}

  @Get()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  @ApiOperation({
    summary: 'Periodos contables de la sede, el más nuevo primero',
    description:
      'Con alcance de denominación la lista es vacía: los periodos pertenecen a una sede.',
  })
  @ApiOkResponse({ type: PeriodDto, isArray: true })
  list(@CurrentTenant() tenant: TenantContext): Promise<PeriodDto[]> {
    return this.periods.list(tenant);
  }

  @Post()
  @RequireAnyPermission(
    AccountingPermissions.budgetsManage,
    AccountingPermissions.cashWrite,
  )
  @ApiOperation({
    summary: 'Abre un periodo contable',
    description:
      'El primero puede ser cualquier mes del año en curso; los siguientes deben ser contiguos a los existentes.',
  })
  @ApiCreatedResponse({ type: PeriodDto })
  @ApiConflictResponse({ description: 'El periodo ya existe' })
  open(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: OpenPeriodDto,
  ): Promise<PeriodDto> {
    return this.periods.open(tenant, body);
  }
}

@ApiTags('accounting-setup')
@ApiTenantScope()
@Controller('accounting/tithe-rules')
export class TitheRulesController {
  constructor(private readonly rules: TitheRulesService) {}

  @Get()
  @RequireAnyPermission(...CATALOG_READ_PERMISSIONS)
  @ApiOperation({
    summary: 'Porcentajes de liquidación del diezmo, el más reciente primero',
  })
  @ApiOkResponse({ type: TitheRuleDto, isArray: true })
  list(@CurrentTenant() tenant: TenantContext): Promise<TitheRuleDto[]> {
    return this.rules.list(tenant);
  }

  @Post()
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary: 'Registra los porcentajes del diezmo desde una fecha',
    description:
      'La denominación los define; el sistema no propone valores por defecto.',
  })
  @ApiCreatedResponse({ type: TitheRuleDto })
  @ApiConflictResponse({
    description: 'Ya existe un porcentaje con esa fecha de inicio',
  })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: SaveTitheRuleDto,
  ): Promise<TitheRuleDto> {
    return this.rules.create(tenant, body);
  }

  @Put(':id')
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary: 'Corrige un porcentaje que aún no se usó en liquidaciones',
  })
  @ApiOkResponse({ type: TitheRuleDto })
  @ApiNotFoundResponse()
  @ApiConflictResponse({ description: 'Fecha repetida o porcentaje en uso' })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: SaveTitheRuleDto,
  ): Promise<TitheRuleDto> {
    return this.rules.update(tenant, id, body);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(MANAGE)
  @ApiOperation({
    summary: 'Elimina un porcentaje que aún no se usó en liquidaciones',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse()
  @ApiForbiddenResponse()
  @ApiConflictResponse({ description: 'El porcentaje está en uso' })
  remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', ParseIntPipe) id: number,
  ): Promise<void> {
    return this.rules.remove(tenant, id);
  }
}
