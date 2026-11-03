import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { PositiveIntPipe } from '../../../common/http/positive-int.pipe.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { ClientIp } from '../../../common/security/current-user.decorators.js';
import { Public } from '../../../common/security/public.decorator.js';
import {
  CheckApplicationStatusUseCase,
  GetCurrentPolicyUseCase,
  ListOpenCongregationsUseCase,
} from '../application/public-reads.use-cases.js';
import { SubmitApplicationUseCase } from '../application/submit-application.use-case.js';
import {
  CurrentPolicyDto,
  OpenCongregationDto,
  PublicStatusDto,
  SubmissionReceiptDto,
  SubmitApplicationDto,
  TrackingStatusRequestDto,
} from './public.dto.js';

const READS = { name: 'public-reads', limit: 120, windowSeconds: 60 };

/**
 * Anonymous endpoints of the membership form. They are throttled per client IP; the catalogs and the
 * municipality search of the form live in the catalogs module (GET /public/catalogs and
 * GET /public/geo/municipalities).
 */
@Public()
@ApiTags('public')
@Controller('public')
export class PublicController {
  constructor(
    private readonly listCongregations: ListOpenCongregationsUseCase,
    private readonly getPolicy: GetCurrentPolicyUseCase,
    private readonly submitApplication: SubmitApplicationUseCase,
    private readonly checkStatus: CheckApplicationStatusUseCase,
  ) {}

  @Get('congregations')
  @RateLimit(READS)
  @ApiOperation({
    summary: 'Sedes que reciben solicitudes',
    description:
      'Sedes activas de denominaciones activas con la inscripción abierta y una política de datos vigente.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [OpenCongregationDto] })
  async congregations(): Promise<OpenCongregationDto[]> {
    return [...(await this.listCongregations.execute())];
  }

  @Get('denominations/:denominationId/privacy-policy/current')
  @RateLimit(READS)
  @ApiOperation({ summary: 'Política de datos vigente de la denominación' })
  @ApiResponse({ status: HttpStatus.OK, type: CurrentPolicyDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'POLICY_NOT_AVAILABLE',
  })
  currentPolicy(
    @Param('denominationId', PositiveIntPipe) denominationId: number,
  ): Promise<CurrentPolicyDto> {
    return this.getPolicy.execute(denominationId);
  }

  @Post('membership-applications')
  @RateLimit({
    name: 'public-application-submit',
    limit: 5,
    windowSeconds: 3600,
  })
  @ApiOperation({
    summary: 'Envía una solicitud de membresía',
    description:
      'Sin cuenta. La sede decide la denominación; el cliente nunca la indica. Devuelve el código de seguimiento, que no se vuelve a mostrar.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: SubmissionReceiptDto })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description: 'CONGREGATION_CLOSED, POLICY_OUTDATED, POLICY_NOT_AVAILABLE',
  })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description:
      'CONSENT_REQUIRED, GUARDIAN_REQUIRED, INVALID_BIRTH_DATE, INVALID_CATALOG_VALUE',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  submit(
    @Body() body: SubmitApplicationDto,
    @ClientIp() ip: string | null,
  ): Promise<SubmissionReceiptDto> {
    return this.submitApplication.execute(body, ip);
  }

  @Post('membership-applications/status')
  @HttpCode(HttpStatus.OK)
  @RateLimit({
    name: 'public-application-status',
    limit: 30,
    windowSeconds: 600,
  })
  @ApiOperation({
    summary: 'Consulta el estado de una solicitud por su código de seguimiento',
    description:
      'Solo estado y fechas; si fue rechazada, un aviso genérico. Nunca datos personales ni el motivo. El código viaja en el cuerpo para que no quede en los registros de acceso.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: PublicStatusDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Código desconocido.',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  status(@Body() body: TrackingStatusRequestDto): Promise<PublicStatusDto> {
    return this.checkStatus.execute(body.trackingCode);
  }
}
