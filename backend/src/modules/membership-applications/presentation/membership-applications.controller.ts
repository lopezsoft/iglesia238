import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { InvalidInputException } from '../../../common/errors/domain.exception.js';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import {
  ClientIp,
  CurrentTenant,
} from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { ApproveApplicationUseCase } from '../application/approve-application.use-case.js';
import { GetApplicationUseCase } from '../application/get-application.use-case.js';
import { ListApplicationsUseCase } from '../application/list-applications.use-case.js';
import { MarkDuplicateUseCase } from '../application/mark-duplicate.use-case.js';
import { RejectApplicationUseCase } from '../application/reject-application.use-case.js';
import { StartReviewUseCase } from '../application/start-review.use-case.js';
import {
  ApplicationDetailDto,
  ApplicationQueueDto,
  ApproveApplicationDto,
  ApprovalResultDto,
  ListApplicationsQueryDto,
  MarkDuplicateDto,
  RejectApplicationDto,
} from './membership-applications.dto.js';

function assertDay(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  if (!isIsoDate(value)) {
    throw new InvalidInputException('La fecha indicada no es válida.');
  }
  return value;
}

@ApiTags('membership-applications')
@ApiTenantScope()
@RequirePermissions('applications.review')
@Controller('membership-applications')
export class MembershipApplicationsController {
  constructor(
    private readonly listApplications: ListApplicationsUseCase,
    private readonly getApplication: GetApplicationUseCase,
    private readonly startReview: StartReviewUseCase,
    private readonly rejectApplication: RejectApplicationUseCase,
    private readonly markDuplicate: MarkDuplicateUseCase,
    private readonly approveApplication: ApproveApplicationUseCase,
  ) {}

  @Get()
  @ApiOperation({
    summary: 'Lista las solicitudes de membresía',
    description:
      'Cola de revisión de la sede activa (o de todas las sedes de la denominación). Incluye el conteo de cada estado.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApplicationQueueDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListApplicationsQueryDto,
  ): Promise<ApplicationQueueDto> {
    return this.listApplications.execute(tenant, {
      filter: query.filter,
      search: query.q?.trim() ? query.q.trim() : null,
      congregationId: query.congregationId ?? null,
      from: assertDay(query.from),
      to: assertDay(query.to),
      order: query.order,
      page: query.page,
      pageSize: query.pageSize,
    }) as Promise<ApplicationQueueDto>;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una solicitud' })
  @ApiResponse({ status: HttpStatus.OK, type: ApplicationDetailDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'No existe o es de otra sede.',
  })
  detail(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ): Promise<ApplicationDetailDto> {
    return this.getApplication.execute(tenant, id);
  }

  @Post(':id/start-review')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Toma la solicitud en revisión (PENDING a IN_REVIEW)',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApplicationDetailDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'INVALID_TRANSITION',
  })
  review(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @ClientIp() ip: string | null,
  ): Promise<ApplicationDetailDto> {
    return this.startReview.execute(tenant, id, ip);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rechaza la solicitud',
    description:
      'El motivo es interno. El solicitante solo ve que su solicitud no fue aprobada.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApplicationDetailDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'INVALID_TRANSITION',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'REJECTION_REASON_*',
  })
  reject(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: RejectApplicationDto,
    @ClientIp() ip: string | null,
  ): Promise<ApplicationDetailDto> {
    return this.rejectApplication.execute(tenant, id, body.reason, ip);
  }

  @Post(':id/mark-duplicate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Marca la solicitud como duplicada de una persona existente',
    description:
      'No crea ningún miembro. La persona debe tener el mismo documento.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApplicationDetailDto })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'INVALID_MATCH',
  })
  duplicate(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: MarkDuplicateDto,
    @ClientIp() ip: string | null,
  ): Promise<ApplicationDetailDto> {
    return this.markDuplicate.execute(tenant, id, body.matchedPersonId, ip);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Aprueba la solicitud y crea el miembro',
    description:
      'En una sola transacción crea (o completa) la persona, el miembro, su registro con número de miembro, el historial de estado y la autorización de datos; y el acudiente de un menor. Con linkToPersonId aprueba sobre una persona ya registrada con el mismo documento.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: ApprovalResultDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'DUPLICATE_DOCUMENT, ALREADY_MEMBER, INVALID_TRANSITION',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: 'GUARDIAN_REQUIRED, INVALID_MATCH, MEMBER_DECEASED',
  })
  approve(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: ApproveApplicationDto,
    @ClientIp() ip: string | null,
  ): Promise<ApprovalResultDto> {
    return this.approveApplication.execute(
      tenant,
      id,
      { linkToPersonId: body.linkToPersonId ?? null },
      ip,
    );
  }
}
