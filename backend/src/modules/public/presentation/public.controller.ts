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
import { withMinimumDuration } from '../../../common/http/minimum-duration.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { ClientIp } from '../../../common/security/current-user.decorators.js';
import { Public } from '../../../common/security/public.decorator.js';
import {
  CheckApplicationStatusUseCase,
  GetCurrentPolicyUseCase,
  ListOpenCongregationsUseCase,
  ListPublicLegalEntitiesUseCase,
} from '../application/public-reads.use-cases.js';
import { RegisterCongregationUseCase } from '../application/register-congregation.use-case.js';
import { SubmitApplicationUseCase } from '../application/submit-application.use-case.js';
import {
  CongregationRegistrationReceiptDto,
  PublicLegalEntityDto,
  RegisterCongregationDto,
} from './congregation-registration.dto.js';
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
 * Floor for the registration: a new account does more work (hash, several writes) than the answer for an
 * address that already has one, and the time must not tell them apart.
 */
const REGISTRATION_MIN_RESPONSE_MS = 800;

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
    private readonly listLegalEntities: ListPublicLegalEntitiesUseCase,
    private readonly registerCongregation: RegisterCongregationUseCase,
  ) {}

  @Get('legal-entities')
  @RateLimit(READS)
  @ApiOperation({
    summary: 'Razones sociales entre las que se puede registrar una sede',
    description:
      'Razones sociales activas de denominaciones activas, ordenadas por denominación y razón social. El NIT va enmascarado (solo se ven sus últimos 3 caracteres).',
  })
  @ApiResponse({ status: HttpStatus.OK, type: [PublicLegalEntityDto] })
  async legalEntities(): Promise<PublicLegalEntityDto[]> {
    return this.listLegalEntities.execute();
  }

  @Post('congregation-registrations')
  @RateLimit({
    name: 'public-congregation-registration',
    limit: 5,
    windowSeconds: 3600,
    failure: 'closed',
  })
  @ApiOperation({
    summary:
      'Registra una sede nueva y crea al usuario que la administra, sin invitación',
    description:
      'Crea en una transacción la sede (activa y con inscripciones abiertas, con un código generado) y al usuario, con los roles Pastor, Secretario(a) y Tesorero(a) sobre esa sede. El usuario puede iniciar sesión de inmediato, pero hasta confirmar su correo las rutas de dominio responden 403 EMAIL_NOT_VERIFIED. Si el correo ya tiene cuenta la respuesta es idéntica y no se crea nada: se avisa por correo a su dueño. Máximo 5 por hora y por IP, y 3 por hora y por correo; si Redis falla, se cierra.',
  })
  @ApiResponse({
    status: HttpStatus.CREATED,
    type: CongregationRegistrationReceiptDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'WEAK_PASSWORD, INVALID_MUNICIPALITY, INVALID_NAME',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'LEGAL_ENTITY_NOT_FOUND: no existe o está inactiva.',
  })
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    description:
      'DUPLICATE_NAME: la denominación ya tiene una sede con ese nombre.',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  register(
    @Body() body: RegisterCongregationDto,
    @ClientIp() ip: string | null,
  ): Promise<CongregationRegistrationReceiptDto> {
    return withMinimumDuration(REGISTRATION_MIN_RESPONSE_MS, () =>
      this.registerCongregation.execute(
        {
          legalEntityId: body.legalEntityId,
          congregation: {
            name: body.congregation.name,
            municipalityCode: body.congregation.municipalityCode,
            address: body.congregation.address ?? null,
            phone: body.congregation.phone ?? null,
            email: body.congregation.email ?? null,
          },
          manager: body.manager,
        },
        ip,
      ),
    );
  }

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
