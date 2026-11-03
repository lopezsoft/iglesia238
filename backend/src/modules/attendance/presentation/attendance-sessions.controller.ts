import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import {
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
  ApiUnprocessableEntityResponse,
} from '@nestjs/swagger';
import type { FastifyReply } from 'fastify';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import type { Page } from '../../../common/pagination/page.js';
import { CurrentTenant } from '../../../common/security/current-user.decorators.js';
import { RequirePermissions } from '../../../common/security/permissions.decorator.js';
import { ApiTenantScope } from '../../../common/tenancy/api-tenant-scope.decorator.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type { AttendanceSessionRecord } from '../application/attendance.models.js';
import { CorrectAttendanceSession } from '../application/correct-attendance-session.use-case.js';
import { DeleteAttendanceSession } from '../application/delete-attendance-session.use-case.js';
import { ExportAttendanceSessions } from '../application/export-attendance-sessions.use-case.js';
import {
  FindAttendanceSessionByKey,
  GetAttendanceSession,
} from '../application/get-attendance-session.use-case.js';
import {
  type AttendanceOptions,
  GetAttendanceOptions,
} from '../application/get-attendance-options.use-case.js';
import {
  type AttendanceStats,
  GetAttendanceStats,
} from '../application/get-attendance-stats.use-case.js';
import { ListAttendanceSessions } from '../application/list-attendance-sessions.use-case.js';
import { RecordAttendanceSession } from '../application/record-attendance-session.use-case.js';
import {
  AttendanceFilterQueryDto,
  AttendanceLookupQueryDto,
  AttendanceOptionsResponseDto,
  AttendancePageResponseDto,
  AttendanceSessionResponseDto,
  AttendanceStatsQueryDto,
  AttendanceStatsResponseDto,
  CreateAttendanceSessionDto,
  ListAttendanceQueryDto,
  UpdateAttendanceCountsDto,
} from './attendance.dto.js';

/** D-03: headcount of each meeting by category. Restricted to the roles that hold attendance.write. */
@ApiTags('attendance')
@ApiTenantScope()
@RequirePermissions('attendance.write')
@ApiForbiddenResponse({
  description: 'Sin el permiso attendance.write en el alcance activo.',
})
@Controller('attendance-sessions')
export class AttendanceSessionsController {
  constructor(
    private readonly getOptions: GetAttendanceOptions,
    private readonly listSessions: ListAttendanceSessions,
    private readonly getSession: GetAttendanceSession,
    private readonly findByKey: FindAttendanceSessionByKey,
    private readonly recordSession: RecordAttendanceSession,
    private readonly correctSession: CorrectAttendanceSession,
    private readonly deleteSession: DeleteAttendanceSession,
    private readonly getStats: GetAttendanceStats,
    private readonly exportSessions: ExportAttendanceSessions,
  ) {}

  @Get('options')
  @ApiOperation({
    summary: 'Sedes del alcance, tipos de reunión, categorías y fecha de hoy',
  })
  @ApiOkResponse({ type: AttendanceOptionsResponseDto })
  options(@CurrentTenant() tenant: TenantContext): Promise<AttendanceOptions> {
    return this.getOptions.execute(tenant);
  }

  @Get()
  @ApiOperation({
    summary: 'Historial de sesiones, la más reciente primero (paginado)',
  })
  @ApiOkResponse({ type: AttendancePageResponseDto })
  list(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: ListAttendanceQueryDto,
  ): Promise<Page<AttendanceSessionRecord>> {
    return this.listSessions.execute(tenant, query);
  }

  @Get('lookup')
  @ApiOperation({
    summary: 'Sesión registrada para una sede, un tipo de reunión y una fecha',
  })
  @ApiOkResponse({ type: AttendanceSessionResponseDto })
  @ApiNotFoundResponse({
    description: 'SESSION_NOT_FOUND: no hay sesión para esa clave.',
  })
  lookup(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: AttendanceLookupQueryDto,
  ): Promise<AttendanceSessionRecord> {
    return this.findByKey.execute(tenant, query);
  }

  @Get('stats')
  @ApiOperation({
    summary:
      'Tendencia: totales por mes o año, promedio, máximo y comparativo anual',
  })
  @ApiOkResponse({ type: AttendanceStatsResponseDto })
  stats(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: AttendanceStatsQueryDto,
  ): Promise<AttendanceStats> {
    return this.getStats.execute(tenant, query);
  }

  @Get('export')
  @ApiOperation({
    summary:
      'Exporta las sesiones filtradas en CSV (UTF-8 con BOM, separador ;)',
  })
  @ApiProduces('text/csv')
  @ApiOkResponse({ description: 'Archivo CSV.' })
  async export(
    @CurrentTenant() tenant: TenantContext,
    @Query() query: AttendanceFilterQueryDto,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<string> {
    const { fileName, content } = await this.exportSessions.execute(
      tenant,
      query,
    );
    void reply
      .header('Content-Type', 'text/csv; charset=utf-8')
      .header('Content-Disposition', `attachment; filename="${fileName}"`);
    return content;
  }

  @Get(':id')
  @ApiOperation({ summary: 'Detalle de una sesión' })
  @ApiOkResponse({ type: AttendanceSessionResponseDto })
  @ApiNotFoundResponse({
    description: 'La sesión no existe o es de otra sede.',
  })
  get(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ): Promise<AttendanceSessionRecord> {
    return this.getSession.execute(tenant, id);
  }

  @Post()
  @ApiOperation({ summary: 'Registra la asistencia de una reunión' })
  @ApiCreatedResponse({ type: AttendanceSessionResponseDto })
  @ApiConflictResponse({
    description:
      'DUPLICATE_SESSION: ya existe una sesión de esa sede, reunión y fecha.',
  })
  @ApiUnprocessableEntityResponse({
    description:
      'INVALID_DATE, INVALID_MEETING_TYPE, INVALID_CATEGORY, INVALID_HEADCOUNT o EMPTY_SESSION.',
  })
  create(
    @CurrentTenant() tenant: TenantContext,
    @Body() body: CreateAttendanceSessionDto,
  ): Promise<AttendanceSessionRecord> {
    return this.recordSession.execute(tenant, body);
  }

  @Put(':id')
  @ApiOperation({
    summary:
      'Corrige los conteos de una sesión (fecha, sede y reunión no cambian)',
  })
  @ApiOkResponse({ type: AttendanceSessionResponseDto })
  @ApiNotFoundResponse({
    description: 'La sesión no existe o es de otra sede.',
  })
  @ApiUnprocessableEntityResponse({
    description: 'INVALID_CATEGORY, INVALID_HEADCOUNT o EMPTY_SESSION.',
  })
  update(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
    @Body() body: UpdateAttendanceCountsDto,
  ): Promise<AttendanceSessionRecord> {
    return this.correctSession.execute(tenant, id, body.attendanceCounts);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Elimina una sesión registrada por error (queda en auditoría)',
  })
  @ApiNoContentResponse()
  @ApiNotFoundResponse({
    description: 'La sesión no existe o es de otra sede.',
  })
  async remove(
    @CurrentTenant() tenant: TenantContext,
    @Param('id', PositiveIntPipe) id: number,
  ): Promise<void> {
    await this.deleteSession.execute(tenant, id);
  }
}
