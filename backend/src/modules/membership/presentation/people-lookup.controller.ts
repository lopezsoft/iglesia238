import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  SearchFamilyCandidatesUseCase,
  SearchPeopleUseCase,
} from '../application/use-cases/search-people.use-case.js';
import { ListPositionCatalogsUseCase } from '../application/use-cases/member-positions.use-cases.js';
import { PeopleSearchQueryDto } from './dto/member-requests.dto.js';
import { CatalogItemDto, PersonOptionDto } from './dto/member-responses.dto.js';
import { IdPipe, toPersonOption } from './request-helpers.js';

/**
 * Thin controllers over SearchPeople: each one fixes the purpose, the permission and the shape of
 * the answer for one consumer. The document is masked by the use case, never here. The secretariat
 * records and the contributions module expose their own endpoints over the same use case.
 */
@ApiTags('people')
@ApiTenantScope()
@Controller()
export class PeopleLookupController {
  constructor(
    private readonly searchPeople: SearchPeopleUseCase,
    private readonly familyCandidates: SearchFamilyCandidatesUseCase,
  ) {}

  @Get('members/candidates')
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Busca personas que todavía no son miembros',
    description:
      'Para registrar como miembro a un familiar o acudiente que ya existe.',
  })
  @ApiOkResponse({ type: [PersonOptionDto] })
  async candidates(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: PeopleSearchQueryDto,
  ) {
    const hits = await this.searchPeople.execute(tenant.tenantScope(), {
      purpose: 'UNLINKED_PERSON',
      query: query.q,
      limit: query.limit,
    });
    return hits.map(toPersonOption);
  }

  @Get('members/guardians')
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Busca adultos que pueden ser acudientes de un menor',
    description:
      'Miembros o no de la denominación; mayores de edad o de edad desconocida.',
  })
  @ApiOkResponse({ type: [PersonOptionDto] })
  async guardians(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: PeopleSearchQueryDto,
  ) {
    const hits = await this.searchPeople.execute(tenant.tenantScope(), {
      purpose: 'FAMILY_CANDIDATE',
      query: query.q,
      limit: query.limit,
      eligibleFor: 'parent',
    });
    return hits.map(toPersonOption);
  }

  @Get('members/:id/family/candidates')
  @RequirePermissions('members.read')
  @ApiOperation({
    summary:
      'Personas de la denominación que se pueden vincular como familiares',
    description: 'Excluye al propio miembro; mínimo 2 caracteres.',
  })
  @ApiOkResponse({ type: [PersonOptionDto] })
  async familyCandidatesOf(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
    @Query() query: PeopleSearchQueryDto,
  ) {
    const hits = await this.familyCandidates.execute(
      tenant.tenantScope(),
      id,
      query.q,
      query.limit,
    );
    return hits.map(toPersonOption);
  }
}

/** Catalogs of the denomination used by the member file and the list filters. */
@ApiTags('members')
@ApiTenantScope()
@Controller()
export class MembershipCatalogsController {
  constructor(private readonly catalogs: ListPositionCatalogsUseCase) {}

  @Get('church-positions')
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'Cargos de la iglesia de la denominación' })
  @ApiOkResponse({ type: [CatalogItemDto] })
  positions(@CurrentTenant() tenant: TenantContext) {
    return this.catalogs.positionCatalog(tenant.tenantScope());
  }

  @Get('pastoral-ranks')
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'Grados pastorales de la denominación' })
  @ApiOkResponse({ type: [CatalogItemDto] })
  ranks(@CurrentTenant() tenant: TenantContext) {
    return this.catalogs.rankCatalog(tenant.tenantScope());
  }
}
