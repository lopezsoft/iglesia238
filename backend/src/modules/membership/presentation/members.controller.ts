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
  Res,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  ExportMembersUseCase,
  ListMembersUseCase,
} from '../application/use-cases/list-members.use-case.js';
import {
  ChangeMemberStatusUseCase,
  GetMemberRegistryUseCase,
  ListTransferDestinationsUseCase,
  TransferMemberUseCase,
} from '../application/use-cases/member-lifecycle.use-cases.js';
import {
  GetMemberUseCase,
  UpdateMemberPersonUseCase,
  UpdateMembershipDataUseCase,
} from '../application/use-cases/member-profile.use-cases.js';
import { CreateMemberUseCase } from '../application/use-cases/create-member.use-case.js';
import {
  ChangeStatusDto,
  CreateMemberDto,
  ListMembersQueryDto,
  MemberFiltersQueryDto,
  PersonDataDto,
  TransferDto,
  UpdateMembershipDto,
} from './dto/member-requests.dto.js';
import {
  CongregationOptionDto,
  MemberDetailDto,
  MemberListPageDto,
  MemberRegistryViewDto,
  TransferResultDto,
} from './dto/member-responses.dto.js';
import {
  IdPipe,
  toCommandContext,
  toFilters,
  toPersonData,
} from './request-helpers.js';

@ApiTags('members')
@ApiTenantScope()
@Controller('members')
export class MembersController {
  constructor(
    private readonly listMembers: ListMembersUseCase,
    private readonly exportMembers: ExportMembersUseCase,
    private readonly getMember: GetMemberUseCase,
    private readonly createMember: CreateMemberUseCase,
    private readonly updatePerson: UpdateMemberPersonUseCase,
    private readonly updateMembership: UpdateMembershipDataUseCase,
    private readonly changeStatus: ChangeMemberStatusUseCase,
    private readonly transferMember: TransferMemberUseCase,
    private readonly registry: GetMemberRegistryUseCase,
    private readonly destinations: ListTransferDestinationsUseCase,
  ) {}

  @Get()
  @RequirePermissions('members.read')
  @ApiOperation({
    summary: 'Lista paginada de miembros',
    description:
      'Filtra por estado, sexo, rango de edad, cargo y texto (nombre, documento o código). Un usuario de sede ve su sede; uno de denominación ve todas, o la que indique congregationId.',
  })
  @ApiOkResponse({ type: MemberListPageDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListMembersQueryDto,
  ) {
    return this.listMembers.execute(tenant.tenantScope(), {
      ...toFilters(query),
      page: query.page,
      pageSize: query.pageSize,
      sortBy: query.sortBy,
      order: query.order,
    });
  }

  @Get('export')
  @RequirePermissions('members.read', 'members.write')
  @ApiOperation({
    summary: 'Exporta el listado filtrado a CSV',
    description:
      'Separado por punto y coma, con BOM. Queda registrado en la auditoría (solo la cantidad de filas).',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV.', schema: { type: 'string' } })
  async export(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Query() query: MemberFiltersQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const result = await this.exportMembers.execute(
      toCommandContext(tenant, ipAddress),
      toFilters(query),
    );
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header(
        'Content-Disposition',
        `attachment; filename="${result.fileName}"`,
      );
    return result.content;
  }

  @Post()
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Registra un miembro manualmente',
    description:
      'Crea la persona (o promueve una existente), el miembro, su registro con el siguiente número de la sede, el historial de estado y la autorización de datos en papel. Requiere una política de datos publicada.',
  })
  @ApiCreatedResponse({ type: MemberDetailDto })
  create(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Body() body: CreateMemberDto,
  ) {
    return this.createMember.execute(toCommandContext(tenant, ipAddress), {
      congregationId: body.congregationId ?? null,
      existingPersonId: body.existingPersonId ?? null,
      person: body.person ? toPersonData(body.person) : null,
      joinedOn: body.joinedOn ?? null,
      isBaptized: body.isBaptized ?? null,
      waterBaptismOn: body.waterBaptismOn ?? null,
      baptismPlace: body.baptismPlace ?? null,
      previousCongregationName: body.previousCongregationName ?? null,
      registryBook: body.registryBook ?? null,
      registryFolio: body.registryFolio ?? null,
      guardianPersonId: body.guardianPersonId ?? null,
      consentAccepted: body.consentAccepted,
    });
  }

  @Get(':id')
  @RequirePermissions('members.read')
  @ApiOperation({ summary: 'Ficha del miembro (datos generales)' })
  @ApiOkResponse({ type: MemberDetailDto })
  detail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
  ) {
    return this.getMember.execute(tenant.tenantScope(), id);
  }

  @Patch(':id/person')
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Edita los datos personales (reemplaza los enviados)',
  })
  @ApiOkResponse({ type: MemberDetailDto })
  updatePersonData(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: PersonDataDto,
  ) {
    return this.updatePerson.execute(
      toCommandContext(tenant, ipAddress),
      id,
      toPersonData(body),
    );
  }

  @Patch(':id/membership')
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Edita los datos de membresía',
    description:
      'Fecha de ingreso, bautismo en agua e iglesia anterior. Un campo ausente no se toca; null lo borra.',
  })
  @ApiOkResponse({ type: MemberDetailDto })
  updateMembershipData(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: UpdateMembershipDto,
  ) {
    return this.updateMembership.execute(
      toCommandContext(tenant, ipAddress),
      id,
      {
        joinedOn: body.joinedOn,
        convertedOn: body.convertedOn,
        isBaptized: body.isBaptized,
        waterBaptismOn: body.waterBaptismOn,
        baptismMunicipalityCode: body.baptismMunicipalityCode,
        baptismPlace: body.baptismPlace,
        baptizingPastorName: body.baptizingPastorName,
        holySpiritBaptismOn: body.holySpiritBaptismOn,
        reconciledOn: body.reconciledOn,
        previousCongregationId: body.previousCongregationId,
        previousCongregationName: body.previousCongregationName,
        isChristianEducationTeacher: body.isChristianEducationTeacher,
        desiredAreas: body.desiredAreas,
        pastorNotes: body.pastorNotes,
      },
    );
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Cambia el estado del miembro',
    description:
      'Activo, inactivo o fallecido, con motivo y fecha. Salir de Activo cierra los cargos vigentes; volver a Activo desde Trasladado abre un nuevo registro en la sede.',
  })
  @ApiOkResponse({ type: MemberDetailDto })
  status(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: ChangeStatusDto,
  ) {
    return this.changeStatus.execute(toCommandContext(tenant, ipAddress), id, {
      status: body.status,
      reason: body.reason ?? null,
      effectiveOn: body.effectiveOn ?? null,
    });
  }

  @Get(':id/registry')
  @RequirePermissions('members.read')
  @ApiOperation({
    summary: 'Registro por sede, traslados e historial de estado',
  })
  @ApiOkResponse({ type: MemberRegistryViewDto })
  registryView(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
  ) {
    return this.registry.execute(tenant.tenantScope(), id);
  }

  @Get(':id/transfer-destinations')
  @RequirePermissions('members.read')
  @ApiOperation({
    summary: 'Sedes activas a las que se puede trasladar al miembro',
  })
  @ApiOkResponse({ type: [CongregationOptionDto] })
  transferDestinations(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', IdPipe) id: number,
  ) {
    return this.destinations.execute(tenant.tenantScope(), id);
  }

  @Post(':id/transfers')
  @RequirePermissions('members.write')
  @ApiOperation({
    summary: 'Traslada al miembro',
    description:
      'Interno: a otra sede de la denominación. Externo: a una iglesia fuera del sistema.',
  })
  @ApiCreatedResponse({ type: TransferResultDto })
  transfer(
    @CurrentTenant() tenant: TenantContext,
    @ClientIp() ipAddress: string | null,
    @Param('id', IdPipe) id: number,
    @Body() body: TransferDto,
  ) {
    const common = { transferDate: body.transferDate, reason: body.reason };
    return this.transferMember.execute(
      toCommandContext(tenant, ipAddress),
      id,
      body.kind === 'INTERNAL'
        ? {
            kind: 'INTERNAL',
            destinationCongregationId: body.destinationCongregationId as number,
            ...common,
          }
        : {
            kind: 'EXTERNAL',
            externalDestinationName: body.externalDestinationName as string,
            ...common,
          },
    );
  }
}
