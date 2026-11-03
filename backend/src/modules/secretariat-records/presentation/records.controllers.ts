import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import type { Page } from '../../../common/pagination/page.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  GetChildDedication,
  ListChildDedications,
  RecordChildDedication,
} from '../application/use-cases/child-dedication.use-cases.js';
import {
  DissolveMarriage,
  GetMarriage,
  ListMarriages,
  RecordMarriage,
} from '../application/use-cases/marriage.use-cases.js';
import {
  ClosePastoralTerm,
  ListPastoralTerms,
  RecordPastoralTerm,
} from '../application/use-cases/pastoral-term.use-cases.js';
import {
  GetRecordsContext,
  GetRecordsSummary,
  type RecordsContext,
  type RecordsSummary,
  SearchRecordPeople,
} from '../application/use-cases/records-overview.use-cases.js';
import type {
  ChildDedicationRecord,
  MarriageRecord,
  PastoralTermRecord,
  PersonOption,
} from '../application/records.models.js';
import {
  ClosePastoralTermDto,
  CreateChildDedicationDto,
  CreateMarriageDto,
  CreatePastoralTermDto,
  DissolveMarriageDto,
  ListChildDedicationsQueryDto,
  ListMarriagesQueryDto,
  ListPastoralTermsQueryDto,
  SearchRecordPeopleQueryDto,
} from './records-requests.dto.js';
import {
  ChildDedicationDto,
  ChildDedicationPageDto,
  MarriageDto,
  MarriagePageDto,
  PastoralTermDto,
  PersonOptionDto,
  RecordsContextDto,
  RecordsSummaryDto,
} from './records-responses.dto.js';

/**
 * Secretariat records (D-04, D-05) hold data of minors and marital status, so every route here needs
 * members.write (pastor and secretary) in the active scope.
 */
const FORBIDDEN_NOTE = 'Sin el permiso members.write en el alcance activo.';

@ApiTags('secretariat-records')
@ApiTenantScope()
@RequirePermissions('members.write')
@ApiForbiddenResponse({ description: FORBIDDEN_NOTE })
@Controller('secretariat')
export class SecretariatRecordsController {
  constructor(
    private readonly getContext: GetRecordsContext,
    private readonly getSummary: GetRecordsSummary,
    private readonly searchPeople: SearchRecordPeople,
  ) {}

  @Get('records/context')
  @ApiOperation({
    summary: 'Sedes del alcance y fecha de hoy para los formularios',
  })
  @ApiOkResponse({ type: RecordsContextDto })
  context(@CurrentTenant() tenant: TenantContext): Promise<RecordsContext> {
    return this.getContext.execute(tenant);
  }

  @Get('records/summary')
  @ApiOperation({
    summary:
      'Cifras de las tarjetas: presentaciones, matrimonios y pastor actual',
  })
  @ApiOkResponse({ type: RecordsSummaryDto })
  summary(@CurrentTenant() tenant: TenantContext): Promise<RecordsSummary> {
    return this.getSummary.execute(tenant);
  }

  @Get('people')
  @ApiOperation({
    summary: 'Busca personas para los formularios de registros',
    description:
      'Usa la búsqueda compartida de personas. Exige un texto de búsqueda y el documento sale siempre enmascarado.',
  })
  @ApiOkResponse({ type: [PersonOptionDto] })
  people(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: SearchRecordPeopleQueryDto,
  ): Promise<PersonOption[]> {
    return this.searchPeople.execute(tenant, {
      query: query.q,
      limit: query.limit,
      eligibleFor: query.eligibleFor,
    });
  }
}

@ApiTags('secretariat-records')
@ApiTenantScope()
@RequirePermissions('members.write')
@ApiForbiddenResponse({ description: FORBIDDEN_NOTE })
@Controller('child-dedications')
export class ChildDedicationsController {
  constructor(
    private readonly listDedications: ListChildDedications,
    private readonly getDedication: GetChildDedication,
    private readonly recordDedication: RecordChildDedication,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Presentaciones de niños (paginado, la más reciente primero)',
    description: 'Datos de menores: el documento del niño sale enmascarado.',
  })
  @ApiOkResponse({ type: ChildDedicationPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListChildDedicationsQueryDto,
  ): Promise<Page<ChildDedicationRecord>> {
    return this.listDedications.execute(tenant, query);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Detalle de una presentación',
    description:
      'Cada consulta individual queda en la auditoría (CHILD_DEDICATION_VIEWED).',
  })
  @ApiOkResponse({ type: ChildDedicationDto })
  @ApiNotFoundResponse({ description: 'DEDICATION_NOT_FOUND.' })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @ClientIp() ip: string | null,
  ): Promise<ChildDedicationRecord> {
    return this.getDedication.execute(tenant, id, ip);
  }

  @Post()
  @ApiOperation({ summary: 'Registra la presentación de un niño' })
  @ApiCreatedResponse({ type: ChildDedicationDto })
  @ApiConflictResponse({
    description: 'DEDICATION_ALREADY_RECORDED: el niño ya fue presentado.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_DATE, PARENT_REQUIRED, INVALID_PARENT u OUT_OF_SCOPE (miembro de otra sede).',
  })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateChildDedicationDto,
  ): Promise<ChildDedicationRecord> {
    return this.recordDedication.execute(tenant, body);
  }
}

@ApiTags('secretariat-records')
@ApiTenantScope()
@RequirePermissions('members.write')
@ApiForbiddenResponse({ description: FORBIDDEN_NOTE })
@Controller('marriages')
export class MarriagesController {
  constructor(
    private readonly listMarriages: ListMarriages,
    private readonly getMarriage: GetMarriage,
    private readonly recordMarriage: RecordMarriage,
    private readonly dissolveMarriage: DissolveMarriage,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Matrimonios del alcance (paginado)',
    description:
      'Una sede ve los matrimonios donde algún cónyuge es miembro de la sede. El concepto del tribunal nunca se expone.',
  })
  @ApiOkResponse({ type: MarriagePageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListMarriagesQueryDto,
  ): Promise<Page<MarriageRecord>> {
    return this.listMarriages.execute(tenant, query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un matrimonio' })
  @ApiOkResponse({ type: MarriageDto })
  @ApiNotFoundResponse({ description: 'MARRIAGE_NOT_FOUND.' })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ): Promise<MarriageRecord> {
    return this.getMarriage.execute(tenant, id);
  }

  @Post()
  @ApiOperation({ summary: 'Registra un matrimonio' })
  @ApiCreatedResponse({ type: MarriageDto })
  @ApiConflictResponse({
    description:
      'ACTIVE_MARRIAGE_EXISTS: un cónyuge ya tiene un matrimonio vigente.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'SAME_PERSON, INVALID_DATE, INVALID_SPOUSE, INVALID_PLACE, INVALID_OFFICIANT u OUT_OF_SCOPE.',
  })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateMarriageDto,
  ): Promise<MarriageRecord> {
    return this.recordMarriage.execute(tenant, body);
  }

  @Post(':id/dissolve')
  @ApiOperation({
    summary:
      'Registra la disolución de un matrimonio (el registro se conserva)',
  })
  @ApiOkResponse({ type: MarriageDto })
  @ApiNotFoundResponse({ description: 'MARRIAGE_NOT_FOUND.' })
  @ApiConflictResponse({ description: 'ALREADY_DISSOLVED.' })
  @ApiUnprocessableEntityResponse({
    description: 'INVALID_DATE o INVALID_END_REASON.',
  })
  dissolve(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: DissolveMarriageDto,
  ): Promise<MarriageRecord> {
    return this.dissolveMarriage.execute(tenant, id, body);
  }
}

@ApiTags('secretariat-records')
@ApiTenantScope()
@RequirePermissions('members.write')
@ApiForbiddenResponse({ description: FORBIDDEN_NOTE })
@Controller('pastoral-terms')
export class PastoralTermsController {
  constructor(
    private readonly listTerms: ListPastoralTerms,
    private readonly recordTerm: RecordPastoralTerm,
    private readonly closeTerm: ClosePastoralTerm,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Periodos pastorales por sede, el más reciente primero',
  })
  @ApiOkResponse({ type: [PastoralTermDto] })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListPastoralTermsQueryDto,
  ): Promise<PastoralTermRecord[]> {
    return this.listTerms.execute(tenant, {
      congregationId: query.congregationId,
      currentOnly: query.current,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Registra el periodo de un pastor en una sede' })
  @ApiCreatedResponse({ type: PastoralTermDto })
  @ApiConflictResponse({
    description:
      'OVERLAPPING_TERM: las fechas se solapan con otro periodo de la sede.',
  })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_DATE.' })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreatePastoralTermDto,
  ): Promise<PastoralTermRecord> {
    return this.recordTerm.execute(tenant, {
      congregationId: body.congregationId,
      pastorId: body.pastorId,
      startedOn: body.startedOn,
      endedOn: body.endedOn ?? null,
      closeCurrent: body.closeCurrent ?? false,
    });
  }

  @Post(':id/close')
  @ApiOperation({ summary: 'Pone fecha de fin al periodo abierto de una sede' })
  @ApiOkResponse({ type: PastoralTermDto })
  @ApiNotFoundResponse({ description: 'TERM_NOT_FOUND.' })
  @ApiConflictResponse({ description: 'TERM_ALREADY_CLOSED.' })
  @ApiUnprocessableEntityResponse({ description: 'INVALID_DATE.' })
  close(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: ClosePastoralTermDto,
  ): Promise<PastoralTermRecord> {
    return this.closeTerm.execute(tenant, id, body.endedOn);
  }
}
