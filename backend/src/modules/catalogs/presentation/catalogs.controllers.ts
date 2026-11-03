import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { RequireAnyPermission } from '../../../common/security/permissions.decorator.js';
import { Public } from '../../../common/security/public.decorator.js';
import {
  EnsureNeighborhoodUseCase,
  GetCatalogsUseCase,
  GetMunicipalityUseCase,
  ListNeighborhoodsUseCase,
  SearchMunicipalitiesUseCase,
} from '../application/catalogs.use-cases.js';
import {
  CatalogsResponseDto,
  CreateNeighborhoodDto,
  EnsuredNeighborhoodDto,
  MunicipalityDto,
  NeighborhoodDto,
  PublicCatalogsResponseDto,
  SearchQueryDto,
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
    private readonly searchMunicipalities: SearchMunicipalitiesUseCase,
    private readonly getMunicipality: GetMunicipalityUseCase,
    private readonly listNeighborhoods: ListNeighborhoodsUseCase,
    private readonly ensureNeighborhood: EnsureNeighborhoodUseCase,
  ) {}

  @Get('municipalities')
  @ApiOperation({
    summary: 'Busca municipios',
    description:
      'Por nombre o por inicio del código DIVIPOLA. Devuelve hasta `limit` resultados.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [MunicipalityDto] })
  search(@Query() query: SearchQueryDto): Promise<MunicipalityDto[]> {
    return this.searchMunicipalities.execute(query.search, query.limit);
  }

  @Get('municipalities/:code')
  @ApiOperation({ summary: 'Un municipio por su código DIVIPOLA' })
  @ApiResponse({ status: HttpStatus.OK, type: MunicipalityDto })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  one(@Param('code') code: string): Promise<MunicipalityDto> {
    return this.getMunicipality.execute(municipalityCode(code));
  }

  @Get('municipalities/:code/neighborhoods')
  @ApiOperation({ summary: 'Barrios de un municipio' })
  @ApiResponse({ status: HttpStatus.OK, type: [NeighborhoodDto] })
  @ApiResponse({ status: HttpStatus.NOT_FOUND })
  neighborhoods(
    @Param('code') code: string,
    @Query() query: SearchQueryDto,
  ): Promise<NeighborhoodDto[]> {
    return this.listNeighborhoods.execute(
      municipalityCode(code),
      query.search,
      query.limit,
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
    @Body() body: CreateNeighborhoodDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<EnsuredNeighborhoodDto> {
    const neighborhood = await this.ensureNeighborhood.execute(
      municipalityCode(code),
      body.name,
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

  @Get('geo/municipalities')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ name: 'public-geo', limit: 240, windowSeconds: FIFTEEN_MINUTES })
  @ApiOperation({ summary: 'Busca municipios (formulario público)' })
  @ApiResponse({ status: HttpStatus.OK, type: [MunicipalityDto] })
  publicMunicipalities(
    @Query() query: SearchQueryDto,
  ): Promise<MunicipalityDto[]> {
    return this.searchMunicipalities.execute(query.search, query.limit);
  }
}
