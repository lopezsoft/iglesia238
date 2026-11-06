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
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import {
  ClientIp,
  CurrentTenant,
  OptionalTenant,
} from '../../../common/security/current-user.decorators.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../../../common/security/permissions.decorator.js';
import { Public } from '../../../common/security/public.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  COUNTRIES_MANAGE_PERMISSION,
  EnsureNeighborhoodUseCase,
  GetCatalogsUseCase,
  GetMunicipalityUseCase,
  ListCountriesUseCase,
  ListNeighborhoodsUseCase,
  ListRegionsUseCase,
  SearchMunicipalitiesUseCase,
} from '../application/catalogs.use-cases.js';
import {
  ListPlatformCountriesUseCase,
  SetCountryActiveUseCase,
} from '../application/platform-countries.use-cases.js';
import {
  CatalogsResponseDto,
  CountriesQueryDto,
  CountryDto,
  CountryQueryDto,
  CountryStatusBodyDto,
  CreateNeighborhoodDto,
  EnsuredNeighborhoodDto,
  MunicipalityDto,
  MunicipalitySearchQueryDto,
  NeighborhoodDto,
  PlatformCountryDto,
  PublicCatalogsResponseDto,
  RegionDto,
  RegionsQueryDto,
} from './catalogs.dto.js';
import {
  PRIVATE_CACHE,
  PUBLIC_CACHE,
  respondCacheable,
} from './conditional-response.js';

const FIFTEEN_MINUTES = 15 * 60;
const MUNICIPALITY_CODE = /^\d{2,10}$/;

/** A malformed code can never match a municipality: it is just "not found". */
function municipalityCode(raw: string): string {
  if (!MUNICIPALITY_CODE.test(raw)) {
    throw new NotFoundDomainException('El municipio no existe.');
  }
  return raw;
}

/** Permissions that justify typing a neighborhood: the screens that capture an address. */
const NEIGHBORHOOD_WRITERS = [
  'congregations.manage',
  'members.write',
  'applications.review',
] as const;

@ApiTags('catalogs')
@ApiBearerAuth()
@Controller('catalogs')
export class CatalogsController {
  constructor(private readonly catalogs: GetCatalogsUseCase) {}

  @Get()
  @ApiOperation({
    summary: 'Catálogos globales',
    description:
      'Tipos de documento, estados civiles, niveles educativos, tipos de estudio, tipos de reunión y categorías de asistencia. Admite ETag.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: CatalogsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_MODIFIED })
  async list(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return respondCacheable(
      request,
      reply,
      await this.catalogs.all(),
      PRIVATE_CACHE,
    );
  }
}

@ApiTags('geo')
@ApiBearerAuth()
@Controller('geo')
export class GeoController {
  constructor(
    private readonly listCountries: ListCountriesUseCase,
    private readonly listRegions: ListRegionsUseCase,
    private readonly searchMunicipalities: SearchMunicipalitiesUseCase,
    private readonly getMunicipality: GetMunicipalityUseCase,
    private readonly listNeighborhoods: ListNeighborhoodsUseCase,
    private readonly ensureNeighborhood: EnsureNeighborhoodUseCase,
  ) {}

  @Get('countries')
  @ApiOperation({
    summary: 'Países activos, por nombre',
    description:
      'hasMunicipalities indica si el país tiene municipios cargados. includeInactive=true agrega los inactivos y solo lo puede pedir el equipo de plataforma (X-Scope: P con denominations.manage).',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [CountryDto] })
  @ApiResponse({
    status: HttpStatus.FORBIDDEN,
    description: 'includeInactive sin permiso',
  })
  countries(
    @Query() query: CountriesQueryDto,
    @OptionalTenant() tenant: TenantContext | null,
  ): Promise<CountryDto[]> {
    return this.listCountries.execute(query.includeInactive ?? false, tenant);
  }

  @Get('regions')
  @ApiOperation({
    summary: 'Departamentos, estados o provincias de un país activo',
    description: 'Ordenados por nombre dentro de countryId.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [RegionDto] })
  regions(@Query() query: RegionsQueryDto): Promise<RegionDto[]> {
    return this.listRegions.execute(query.countryId);
  }

  @Get('municipalities')
  @ApiOperation({
    summary: 'Busca municipios de los países activos',
    description:
      'Por nombre o por inicio del código. countryId limita la búsqueda a un país y regionCode a un departamento o estado. Devuelve hasta limit resultados.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [MunicipalityDto] })
  search(
    @Query() query: MunicipalitySearchQueryDto,
  ): Promise<MunicipalityDto[]> {
    return this.searchMunicipalities.execute(
      query.search,
      query.limit,
      query.countryId,
      query.regionCode,
    );
  }

  @Get('municipalities/:code')
  @ApiOperation({
    summary:
      'Un municipio por su código, dentro de countryId (o del país por defecto)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: MunicipalityDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  one(
    @Param('code') code: string,
    @Query() query: CountryQueryDto,
  ): Promise<MunicipalityDto> {
    return this.getMunicipality.execute(
      municipalityCode(code),
      query.countryId,
    );
  }

  @Get('municipalities/:code/neighborhoods')
  @ApiOperation({ summary: 'Barrios de un municipio' })
  @ApiResponse({ status: HttpStatus.OK, type: [NeighborhoodDto] })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  neighborhoods(
    @Param('code') code: string,
    @Query() query: MunicipalitySearchQueryDto,
  ): Promise<NeighborhoodDto[]> {
    return this.listNeighborhoods.execute(
      municipalityCode(code),
      query.search,
      query.limit,
      query.countryId,
    );
  }

  @Post('municipalities/:code/neighborhoods')
  @RequireAnyPermission(...NEIGHBORHOOD_WRITERS)
  // The table is shared by every denomination: cap how fast one client can fill it.
  @RateLimit({ name: 'neighborhood-create', limit: 30, windowSeconds: 3600 })
  @ApiOperation({
    summary: 'Busca o crea un barrio',
    description:
      'Si ya existe uno con ese nombre (sin distinguir mayúsculas ni tildes) lo devuelve con 200; si no, lo crea y responde 201.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: EnsuredNeighborhoodDto })
  @ApiResponse({ status: HttpStatus.OK, type: EnsuredNeighborhoodDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  async ensure(
    @Param('code') code: string,
    @Query() query: CountryQueryDto,
    @Body() body: CreateNeighborhoodDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<EnsuredNeighborhoodDto> {
    const neighborhood = await this.ensureNeighborhood.execute(
      municipalityCode(code),
      body.name,
      query.countryId,
    );
    void reply.status(
      neighborhood.created ? HttpStatus.CREATED : HttpStatus.OK,
    );
    return neighborhood;
  }
}

/** What the public application form needs before anyone signs in. */
@Public()
@ApiTags('public')
@Controller('public')
export class PublicCatalogsController {
  constructor(
    private readonly catalogs: GetCatalogsUseCase,
    private readonly listRegions: ListRegionsUseCase,
    private readonly searchMunicipalities: SearchMunicipalitiesUseCase,
  ) {}

  @Get('catalogs')
  @RateLimit({
    name: 'public-catalogs',
    limit: 120,
    windowSeconds: FIFTEEN_MINUTES,
  })
  @ApiOperation({
    summary: 'Catálogos del formulario público',
    description: 'Tipos de documento y estados civiles. Admite ETag.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PublicCatalogsResponseDto })
  @ApiResponse({ status: HttpStatus.NOT_MODIFIED })
  async publicCatalogs(
    @Req() request: FastifyRequest,
    @Res({ passthrough: true }) reply: FastifyReply,
  ) {
    return respondCacheable(
      request,
      reply,
      await this.catalogs.publicSubset(),
      PUBLIC_CACHE,
    );
  }

  @Get('geo/regions')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'public-geo-regions', limit: 120, windowSeconds: FIFTEEN_MINUTES })
  @ApiOperation({
    summary: 'Departamentos, estados o provincias de un país activo (formularios públicos)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [RegionDto] })
  publicRegions(@Query() query: RegionsQueryDto): Promise<RegionDto[]> {
    return this.listRegions.execute(query.countryId);
  }

  @Get('geo/municipalities')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'public-geo', limit: 240, windowSeconds: FIFTEEN_MINUTES })
  @ApiOperation({
    summary: 'Busca municipios de los países activos (formularios públicos)',
    description: 'countryId limita la búsqueda a un país y regionCode a un departamento o estado.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [MunicipalityDto] })
  publicMunicipalities(
    @Query() query: MunicipalitySearchQueryDto,
  ): Promise<MunicipalityDto[]> {
    return this.searchMunicipalities.execute(
      query.search,
      query.limit,
      query.countryId,
      query.regionCode,
    );
  }
}

/** The platform team decides which countries the system offers. */
@ApiTags('geo')
@ApiTenantScope()
@RequirePermissions(COUNTRIES_MANAGE_PERMISSION)
@Controller('platform/countries')
export class PlatformCountriesController {
  constructor(
    private readonly listCountries: ListPlatformCountriesUseCase,
    private readonly setActive: SetCountryActiveUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary:
      'Todos los países, activos o no, con sus departamentos y municipios cargados',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [PlatformCountryDto] })
  list(@CurrentTenant() context: TenantContext): Promise<PlatformCountryDto[]> {
    return this.listCountries.execute(context);
  }

  @Patch(':id/status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Activa o desactiva un país (no se puede desactivar con razones sociales activas)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PlatformCountryDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'COUNTRY_NOT_FOUND',
  })
  @ApiResponse({ status: HttpStatus.CONFLICT, description: 'COUNTRY_IN_USE' })
  status(
    @CurrentTenant() context: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: CountryStatusBodyDto,
  ): Promise<PlatformCountryDto> {
    return this.setActive.execute({
      context,
      ipAddress,
      id,
      isActive: body.isActive,
    });
  }
}
