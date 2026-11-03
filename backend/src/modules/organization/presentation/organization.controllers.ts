import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
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
import {
  CreateCongregationUseCase,
  ListCongregationsUseCase,
  ListSelectableCongregationsUseCase,
  SetAcceptsApplicationsUseCase,
  SetCongregationActiveUseCase,
  UpdateCongregationUseCase,
  type CongregationInput,
} from '../application/congregations.use-cases.js';
import {
  CreateDistrictUseCase,
  ListDistrictsUseCase,
  UpdateDistrictUseCase,
} from '../application/districts.use-cases.js';
import {
  CreateLegalEntityUseCase,
  ListLegalEntitiesUseCase,
  SetLegalEntityActiveUseCase,
  UpdateLegalEntityUseCase,
  type LegalEntityInput,
} from '../application/legal-entities.use-cases.js';
import {
  GetCongregationFormOptionsUseCase,
  GetOrganizationOverviewUseCase,
} from '../application/organization-queries.use-cases.js';
import {
  AcceptsApplicationsBodyDto,
  CongregationBodyDto,
  CongregationDto,
  CongregationFormOptionsDto,
  DistrictBodyDto,
  DistrictDto,
  LegalEntityBodyDto,
  LegalEntityDto,
  OrganizationOverviewDto,
  StatusBodyDto,
} from './organization.dto.js';

function toCongregationInput(body: CongregationBodyDto): CongregationInput {
  return {
    name: body.name,
    code: body.code ?? null,
    legalEntityId: body.legalEntityId,
    districtId: body.districtId ?? null,
    municipalityCode: body.municipalityCode,
    neighborhood: body.neighborhood ?? null,
    address: body.address,
    phone: body.phone ?? null,
    email: body.email ?? null,
    acceptsApplications: body.acceptsApplications,
  };
}

function toLegalEntityInput(body: LegalEntityBodyDto): LegalEntityInput {
  return {
    legalName: body.legalName,
    tradeName: body.tradeName ?? null,
    taxId: body.taxId,
    legalRepresentative: body.legalRepresentative,
    municipalityCode: body.municipalityCode,
    email: body.email ?? null,
    phone: body.phone ?? null,
    address: body.address ?? null,
  };
}

@ApiTags('organization')
@ApiTenantScope()
@RequirePermissions('congregations.manage')
@Controller('organization')
export class OrganizationController {
  constructor(private readonly getOverview: GetOrganizationOverviewUseCase) {}

  @Get('overview')
  @ApiOperation({ summary: 'Totales de la estructura de la denominación' })
  @ApiResponse({ status: HttpStatus.OK, type: OrganizationOverviewDto })
  overview(@CurrentTenant() context: TenantContext) {
    return this.getOverview.execute(context);
  }
}

@ApiTags('organization')
@ApiTenantScope()
@RequirePermissions('congregations.manage')
@Controller('organization/congregations')
export class CongregationsController {
  constructor(
    private readonly listCongregations: ListCongregationsUseCase,
    private readonly formOptions: GetCongregationFormOptionsUseCase,
    private readonly createCongregation: CreateCongregationUseCase,
    private readonly updateCongregation: UpdateCongregationUseCase,
    private readonly setActive: SetCongregationActiveUseCase,
    private readonly setAccepts: SetAcceptsApplicationsUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista todas las sedes de la denominación, con municipio, departamento y barrio resueltos',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [CongregationDto] })
  list(@CurrentTenant() context: TenantContext) {
    return this.listCongregations.execute(context);
  }

  @Get('form-options')
  @ApiOperation({
    summary: 'Razones sociales y distritos para el formulario de sede',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CongregationFormOptionsDto })
  options(@CurrentTenant() context: TenantContext) {
    return this.formOptions.execute(context);
  }

  @Post()
  @ApiOperation({
    summary:
      'Crea una sede. Si no se envía el código, se genera a partir del nombre',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: CongregationDto })
  create(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: CongregationBodyDto,
  ) {
    return this.createCongregation.execute({
      context,
      ipAddress,
      input: toCongregationInput(body),
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edita una sede' })
  @ApiResponse({ status: HttpStatus.OK, type: CongregationDto })
  update(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: CongregationBodyDto,
  ) {
    return this.updateCongregation.execute({
      context,
      ipAddress,
      id,
      input: toCongregationInput(body),
    });
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Activa o desactiva la sede. Al desactivarla se cierran las inscripciones',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CongregationDto })
  status(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: StatusBodyDto,
  ) {
    return this.setActive.execute({
      context,
      ipAddress,
      id,
      isActive: body.isActive,
    });
  }

  @Patch(':id/accepts-applications')
  @ApiOperation({ summary: 'Abre o cierra las inscripciones de la sede' })
  @ApiResponse({ status: HttpStatus.OK, type: CongregationDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'CONGREGATION_INACTIVE: la sede inactiva no abre inscripciones',
  })
  acceptsApplications(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: AcceptsApplicationsBodyDto,
  ) {
    return this.setAccepts.execute({
      context,
      ipAddress,
      id,
      acceptsApplications: body.acceptsApplications,
    });
  }
}

@ApiTags('organization')
@ApiTenantScope()
@RequirePermissions('congregations.manage')
@Controller('organization/legal-entities')
export class LegalEntitiesController {
  constructor(
    private readonly listLegalEntities: ListLegalEntitiesUseCase,
    private readonly createLegalEntity: CreateLegalEntityUseCase,
    private readonly updateLegalEntity: UpdateLegalEntityUseCase,
    private readonly setActive: SetLegalEntityActiveUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista las razones sociales de la denominación' })
  @ApiResponse({ status: HttpStatus.OK, type: [LegalEntityDto] })
  list(@CurrentTenant() context: TenantContext) {
    return this.listLegalEntities.execute(context);
  }

  @Post()
  @ApiOperation({
    summary: 'Crea una razón social (el NIT es único en la plataforma)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: LegalEntityDto })
  create(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: LegalEntityBodyDto,
  ) {
    return this.createLegalEntity.execute({
      context,
      ipAddress,
      input: toLegalEntityInput(body),
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edita una razón social' })
  @ApiResponse({ status: HttpStatus.OK, type: LegalEntityDto })
  update(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: LegalEntityBodyDto,
  ) {
    return this.updateLegalEntity.execute({
      context,
      ipAddress,
      id,
      input: toLegalEntityInput(body),
    });
  }

  @Patch(':id/status')
  @ApiOperation({
    summary:
      'Activa o desactiva la razón social (no se puede desactivar con sedes activas)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: LegalEntityDto })
  status(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: StatusBodyDto,
  ) {
    return this.setActive.execute({
      context,
      ipAddress,
      id,
      isActive: body.isActive,
    });
  }
}

@ApiTags('organization')
@ApiTenantScope()
@RequirePermissions('congregations.manage')
@Controller('organization/districts')
export class DistrictsController {
  constructor(
    private readonly listDistricts: ListDistrictsUseCase,
    private readonly createDistrict: CreateDistrictUseCase,
    private readonly updateDistrict: UpdateDistrictUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Lista los distritos con las sedes que contienen' })
  @ApiResponse({ status: HttpStatus.OK, type: [DistrictDto] })
  list(@CurrentTenant() context: TenantContext) {
    return this.listDistricts.execute(context);
  }

  @Post()
  @ApiOperation({ summary: 'Crea un distrito' })
  @ApiResponse({ status: HttpStatus.CREATED, type: DistrictDto })
  create(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: DistrictBodyDto,
  ) {
    return this.createDistrict.execute({
      context,
      ipAddress,
      input: { number: body.number, name: body.name ?? null },
    });
  }

  @Put(':id')
  @ApiOperation({ summary: 'Edita un distrito' })
  @ApiResponse({ status: HttpStatus.OK, type: DistrictDto })
  update(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: DistrictBodyDto,
  ) {
    return this.updateDistrict.execute({
      context,
      ipAddress,
      id,
      input: { number: body.number, name: body.name ?? null },
    });
  }
}

/** Sedes a session can choose from. It needs a tenant scope but no special permission. */
@ApiTags('organization')
@ApiTenantScope()
@Controller('congregations')
export class SelectableCongregationsController {
  constructor(
    private readonly selectable: ListSelectableCongregationsUseCase,
  ) {}

  @Get('selectable')
  @ApiOperation({
    summary:
      'Sedes activas dentro del alcance de la sesión (una para un rol de sede, todas para una denominación)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [CongregationDto] })
  list(@CurrentTenant() context: TenantContext) {
    return this.selectable.execute(context);
  }
}
