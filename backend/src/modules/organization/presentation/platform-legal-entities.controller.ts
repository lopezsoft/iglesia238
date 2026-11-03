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
import type { LegalEntityInput } from '../application/legal-entities.use-cases.js';
import {
  CreatePlatformLegalEntityUseCase,
  ListPlatformLegalEntitiesUseCase,
  SetPlatformLegalEntityActiveUseCase,
  UpdatePlatformLegalEntityUseCase,
  type LegalEntityPatch,
} from '../application/platform-legal-entities.use-cases.js';
import { StatusBodyDto } from './organization.dto.js';
import {
  PlatformLegalEntitiesQueryDto,
  PlatformLegalEntityCreateDto,
  PlatformLegalEntityDto,
  PlatformLegalEntityUpdateDto,
} from './platform-legal-entities.dto.js';

function toCreateInput(body: PlatformLegalEntityCreateDto): LegalEntityInput {
  return {
    legalName: body.legalName,
    tradeName: body.tradeName ?? null,
    taxId: body.taxId,
    legalRepresentative: body.legalRepresentative,
    countryId: body.countryId,
    municipalityCode: body.municipalityCode ?? null,
    email: body.email ?? null,
    phone: body.phone ?? null,
    address: body.address ?? null,
  };
}

function toPatch(body: PlatformLegalEntityUpdateDto): LegalEntityPatch {
  return {
    legalName: body.legalName,
    tradeName: body.tradeName,
    taxId: body.taxId,
    legalRepresentative: body.legalRepresentative,
    countryId: body.countryId,
    municipalityCode: body.municipalityCode,
    email: body.email,
    phone: body.phone,
    address: body.address,
  };
}

/**
 * The platform team creates the legal entities (razones sociales) of every church, so that anyone can
 * later register a congregation under one of them from the login screen. The platform sees structure
 * only. The routes of the denomination (`/organization/legal-entities`) keep working as before.
 */
@ApiTags('organization')
@ApiTenantScope()
@RequirePermissions('denominations.manage')
@Controller('platform/legal-entities')
export class PlatformLegalEntitiesController {
  constructor(
    private readonly listLegalEntities: ListPlatformLegalEntitiesUseCase,
    private readonly createLegalEntity: CreatePlatformLegalEntityUseCase,
    private readonly updateLegalEntity: UpdatePlatformLegalEntityUseCase,
    private readonly setActive: SetPlatformLegalEntityActiveUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Lista las razones sociales de todas las denominaciones (o de una), con el nombre de la denominación y el número de sedes',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [PlatformLegalEntityDto] })
  list(
    @CurrentTenant() context: TenantContext,
    @Query() query: PlatformLegalEntitiesQueryDto,
  ) {
    return this.listLegalEntities.execute(
      context,
      query.denominationId ?? null,
    );
  }

  @Post()
  @ApiOperation({
    summary:
      'Crea una razón social en una denominación (el NIT es único en la plataforma)',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: PlatformLegalEntityDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'MUNICIPALITY_COUNTRY_MISMATCH',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'La denominación no existe, o COUNTRY_NOT_FOUND.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'DUPLICATE_TAX_ID o DENOMINATION_INACTIVE',
  })
  create(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: PlatformLegalEntityCreateDto,
  ) {
    return this.createLegalEntity.execute({
      context,
      ipAddress,
      denominationId: body.denominationId,
      input: toCreateInput(body),
    });
  }

  @Patch(':id')
  @ApiOperation({
    summary:
      'Edita una razón social; solo cambian los campos enviados (la denominación no cambia)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PlatformLegalEntityDto })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description:
      'MUNICIPALITY_COUNTRY_MISMATCH (también al cambiar el país sin enviar un municipio nuevo o null)',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'COUNTRY_NOT_FOUND',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'DUPLICATE_TAX_ID o LEGAL_ENTITY_HAS_CONGREGATIONS',
  })
  update(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: PlatformLegalEntityUpdateDto,
  ) {
    return this.updateLegalEntity.execute({
      context,
      ipAddress,
      id,
      patch: toPatch(body),
    });
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Activa o desactiva la razón social (no se puede desactivar con sedes activas)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PlatformLegalEntityDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'LEGAL_ENTITY_IN_USE',
  })
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
