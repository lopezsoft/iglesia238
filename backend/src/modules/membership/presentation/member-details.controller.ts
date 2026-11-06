import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  AddFamilyRelationUseCase,
  ListFamilyUseCase,
  RemoveFamilyRelationUseCase,
  UpdateFamilyRelationUseCase,
} from '../application/use-cases/member-family.use-cases.js';
import {
  AssignPositionUseCase,
  ClosePositionUseCase,
  GetMemberPositionsUseCase,
  SetPastoralRankUseCase,
} from '../application/use-cases/member-positions.use-cases.js';
import {
  AddStudyUseCase,
  ListStudiesUseCase,
  RemoveStudyUseCase,
  UpdateStudyUseCase,
} from '../application/use-cases/member-studies.use-cases.js';
import {
  AssignPositionDto,
  ClosePositionDto,
  FamilyRelationDto,
  PastoralRankDto,
  PersonStudyDto,
  UpdateFamilyRelationDto,
} from './dto/member-requests.dto.js';
import {
  FamilyRelationViewDto,
  MemberPositionsViewDto,
  PersonStudyViewDto,
} from './dto/member-responses.dto.js';
import { IdPipe, toCommandContext } from './request-helpers.js';

/** Family, studies, positions and pastoral rank of a member. */
@ApiTags('members')
@ApiTenantScope()
@Controller('members/:id')
export class MemberDetailsController {
  constructor(
    private readonly listFamily: ListFamilyUseCase,
    private readonly addFamily: AddFamilyRelationUseCase,
    private readonly updateFamily: UpdateFamilyRelationUseCase,
    private readonly removeFamily: RemoveFamilyRelationUseCase,
    private readonly listStudies: ListStudiesUseCase,
    private readonly addStudy: AddStudyUseCase,
    private readonly updateStudy: UpdateStudyUseCase,
    private readonly removeStudy: RemoveStudyUseCase,
    private readonly positions: GetMemberPositionsUseCase,
    private readonly assignPosition: AssignPositionUseCase,
    private readonly closePosition: ClosePositionUseCase,
    private readonly setRank: SetPastoralRankUseCase,
  ) {}

  // ---------- Family ----------

  @Get('family')
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'Familiares del miembro (documento enmascarado)' })
  @ApiOkResponse({ type: [FamilyRelationViewDto] })
  family(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
  ) {
    return this.listFamily.execute(tenant.tenantScope(), id);
  }

  @Post('family')
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Agrega un familiar',
    description:
      'Guarda también el vínculo inverso cuando no es ambiguo (padre/madre ↔ hijo).',
  })
  @ApiCreatedResponse({ description: 'Parentesco registrado.' })
  async addRelation(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: FamilyRelationDto,
  ): Promise<void> {
    await this.addFamily.execute(toCommandContext(tenant, ipAddress), id, body);
  }

  @Patch('family/:relationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Actualiza un familiar y su parentesco' })
  @ApiNoContentResponse()
  async updateRelation(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Param('relationId', IdPipe) relationId: number,
    @Body() body: UpdateFamilyRelationDto,
  ): Promise<void> {
    await this.updateFamily.execute(
      toCommandContext(tenant, ipAddress),
      id,
      relationId,
      body,
    );
  }

  @Delete('family/:relationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Quita un parentesco (y su inverso)' })
  @ApiNoContentResponse()
  async removeRelation(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Param('relationId', IdPipe) relationId: number,
  ): Promise<void> {
    await this.removeFamily.execute(
      toCommandContext(tenant, ipAddress),
      id,
      relationId,
    );
  }

  // ---------- Studies ----------

  @Get('studies')
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'Estudios del miembro (el más reciente primero)' })
  @ApiOkResponse({ type: [PersonStudyViewDto] })
  studies(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
  ) {
    return this.listStudies.execute(tenant.tenantScope(), id);
  }

  @Post('studies')
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Registra un estudio' })
  @ApiCreatedResponse({ description: 'Estudio registrado.' })
  async addPersonStudy(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: PersonStudyDto,
  ): Promise<void> {
    await this.addStudy.execute(toCommandContext(tenant, ipAddress), id, {
      studyTypeCode: body.studyTypeCode,
      name: body.name,
      institution: body.institution ?? null,
      status: body.status,
      year: body.year ?? null,
    });
  }

  @Patch('studies/:studyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Actualiza un estudio' })
  @ApiNoContentResponse()
  async updatePersonStudy(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Param('studyId', IdPipe) studyId: number,
    @Body() body: PersonStudyDto,
  ): Promise<void> {
    await this.updateStudy.execute(
      toCommandContext(tenant, ipAddress),
      id,
      studyId,
      {
        studyTypeCode: body.studyTypeCode,
        name: body.name,
        institution: body.institution ?? null,
        status: body.status,
        year: body.year ?? null,
      },
    );
  }

  @Delete('studies/:studyId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Quita un estudio' })
  @ApiNoContentResponse()
  async removePersonStudy(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Param('studyId', IdPipe) studyId: number,
  ): Promise<void> {
    await this.removeStudy.execute(
      toCommandContext(tenant, ipAddress),
      id,
      studyId,
    );
  }

  // ---------- Positions and rank ----------

  @Get('positions')
  @RequirePermissions('members.read')
  @ApiOperation({
    summary: 'Cargos, grado pastoral y catálogos para asignarlos',
  })
  @ApiOkResponse({ type: MemberPositionsViewDto })
  positionsView(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
  ) {
    return this.positions.execute(tenant.tenantScope(), id);
  }

  @Post('positions')
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Asigna un cargo (solo miembros activos)' })
  @ApiCreatedResponse({ description: 'Cargo asignado.' })
  async assign(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: AssignPositionDto,
  ): Promise<void> {
    await this.assignPosition.execute(
      toCommandContext(tenant, ipAddress),
      id,
      body,
    );
  }

  @Post('positions/:memberPositionId/close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Cierra un cargo vigente' })
  @ApiNoContentResponse()
  async close(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Param('memberPositionId', IdPipe) memberPositionId: number,
    @Body() body: ClosePositionDto,
  ): Promise<void> {
    await this.closePosition.execute(
      toCommandContext(tenant, ipAddress),
      id,
      memberPositionId,
      body.endedOn,
    );
  }

  @Put('pastoral-rank')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('members.write')
  @ApiOperation({ summary: 'Asigna o quita el grado pastoral' })
  @ApiNoContentResponse()
  async rank(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: PastoralRankDto,
  ): Promise<void> {
    await this.setRank.execute(
      toCommandContext(tenant, ipAddress),
      id,
      body.pastoralRankId ?? null,
    );
  }
}
