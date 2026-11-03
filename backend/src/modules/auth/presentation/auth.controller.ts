import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { withMinimumDuration } from '../../../common/http/minimum-duration.js';
import { RateLimit } from '../../../common/rate-limit/rate-limit.decorator.js';
import { AllowUnverifiedEmail } from '../../../common/security/allow-unverified-email.decorator.js';
import {
  ClientIp,
  CurrentPrincipal,
} from '../../../common/security/current-user.decorators.js';
import { Public } from '../../../common/security/public.decorator.js';
import type { Principal } from '../../../common/security/request-context.js';
import {
  AcceptInvitationUseCase,
  GetInvitationUseCase,
} from '../application/invitations.use-cases.js';
import { InvalidInvitationException } from '../application/auth.errors.js';
import {
  AUTH_SETTINGS,
  type AuthSettings,
} from '../application/auth.settings.js';
import { ChangePasswordUseCase } from '../application/change-password.use-case.js';
import {
  ConfirmEmailVerificationUseCase,
  ResendEmailVerificationUseCase,
} from '../application/email-verification.use-cases.js';
import { ConfirmPasswordResetUseCase } from '../application/confirm-password-reset.use-case.js';
import { GetSessionUseCase } from '../application/get-session.use-case.js';
import { LoginUseCase } from '../application/login.use-case.js';
import { LogoutUseCase } from '../application/logout.use-case.js';
import { RefreshSessionUseCase } from '../application/refresh-session.use-case.js';
import { RequestPasswordResetUseCase } from '../application/request-password-reset.use-case.js';
import {
  AcceptInvitationDto,
  ChangePasswordDto,
  EmailVerificationConfirmDto,
  EmailVerificationResendResponseDto,
  InvitationLookupDto,
  InvitationResponseDto,
  LoginRequestDto,
  PasswordResetConfirmDto,
  PasswordResetRequestDto,
  SessionResponseDto,
  TOKEN_PATTERN,
  TokenResponseDto,
} from './auth.dto.js';
import {
  toInvitationResponse,
  toSessionResponse,
  toTokenResponse,
} from './auth.mapper.js';
import {
  clearRefreshCookie,
  readRefreshCookie,
  requireRequestedWith,
  writeRefreshCookie,
} from './refresh-cookie.js';

const FIFTEEN_MINUTES = 15 * 60;
const ONE_HOUR = 60 * 60;
/** Floor for the recovery request, above the usual time of its database work. */
const PASSWORD_RESET_MIN_RESPONSE_MS = 400;

const REQUESTED_WITH_HEADER = ApiHeader({
  name: 'X-Requested-With',
  required: true,
  description:
    'Cualquier valor no vacío (por ejemplo XMLHttpRequest). Protege la cookie de refresco.',
});

/**
 * Account routes. The whole controller is open to a user whose e-mail is not confirmed yet
 * (@AllowUnverifiedEmail): they must be able to read their session, renew it, ask for a new
 * confirmation link, change the password and sign out. Everything else answers 403 EMAIL_NOT_VERIFIED.
 */
@AllowUnverifiedEmail()
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly login: LoginUseCase,
    private readonly refresh: RefreshSessionUseCase,
    private readonly logoutUseCase: LogoutUseCase,
    private readonly getSession: GetSessionUseCase,
    private readonly requestReset: RequestPasswordResetUseCase,
    private readonly confirmReset: ConfirmPasswordResetUseCase,
    private readonly getInvitation: GetInvitationUseCase,
    private readonly acceptInvitation: AcceptInvitationUseCase,
    private readonly changePasswordUseCase: ChangePasswordUseCase,
    private readonly confirmEmail: ConfirmEmailVerificationUseCase,
    private readonly resendEmail: ResendEmailVerificationUseCase,
    @Inject(AUTH_SETTINGS) private readonly settings: AuthSettings,
  ) {}

  @Public()
  @RateLimit({
    name: 'auth-login',
    limit: 30,
    windowSeconds: FIFTEEN_MINUTES,
    failure: 'closed',
  })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inicia sesión con correo y contraseña',
    description:
      'Devuelve el access token y la sesión; el refresh token viaja en una cookie HttpOnly. Tras 5 intentos fallidos bloquea la cuenta 15 minutos; mientras dura el bloqueo responde igual que una credencial incorrecta (401), para no revelar si el correo existe.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: TokenResponseDto })
  @ApiResponse({
    status: HttpStatus.UNAUTHORIZED,
    description: 'INVALID_CREDENTIALS',
  })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'NO_ACTIVE_ROLES' })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  async loginWithPassword(
    @Body() body: LoginRequestDto,
    @ClientIp() ipAddress: string | null,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TokenResponseDto> {
    const issued = await this.login.execute({
      email: body.email,
      password: body.password,
      ipAddress,
    });
    writeRefreshCookie(reply, issued.refreshToken, {
      maxAgeSeconds: issued.refreshMaxAgeSeconds,
      secure: this.settings.cookieSecure,
    });
    return toTokenResponse(issued);
  }

  @Public()
  @RateLimit({
    name: 'auth-refresh',
    limit: 120,
    windowSeconds: FIFTEEN_MINUTES,
  })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @REQUESTED_WITH_HEADER
  @ApiOperation({
    summary: 'Renueva el access token con la cookie de refresco',
    description:
      'Rota el refresh token. Reusar uno ya rotado cierra toda la sesión.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: TokenResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  async refreshSession(
    @Req() request: FastifyRequest,
    @ClientIp() ipAddress: string | null,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<TokenResponseDto> {
    requireRequestedWith(request);
    // A rejected refresh does not clear the cookie: with two tabs refreshing at once the loser must not
    // erase the cookie the winner has just rotated. A revoked cookie is useless and expires by itself.
    const issued = await this.refresh.execute(
      readRefreshCookie(request),
      ipAddress,
    );
    writeRefreshCookie(reply, issued.refreshToken, {
      maxAgeSeconds: issued.refreshMaxAgeSeconds,
      secure: this.settings.cookieSecure,
    });
    return toTokenResponse(issued);
  }

  @Public()
  @RateLimit({
    name: 'auth-logout',
    limit: 120,
    windowSeconds: FIFTEEN_MINUTES,
  })
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @REQUESTED_WITH_HEADER
  @ApiOperation({ summary: 'Cierra la sesión y borra la cookie de refresco' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  async logoutSession(
    @Req() request: FastifyRequest,
    @ClientIp() ipAddress: string | null,
    @Res({ passthrough: true }) reply: FastifyReply,
  ): Promise<void> {
    requireRequestedWith(request);
    await this.logoutUseCase.execute(readRefreshCookie(request), ipAddress);
    clearRefreshCookie(reply, { secure: this.settings.cookieSecure });
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Sesión del usuario autenticado',
    description:
      'Roles vigentes con sus permisos, y los alcances (plataforma, denominación o sede) donde puede actuar.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: SessionResponseDto })
  @ApiResponse({ status: HttpStatus.UNAUTHORIZED })
  @ApiResponse({ status: HttpStatus.FORBIDDEN, description: 'NO_ACTIVE_ROLES' })
  async me(
    @CurrentPrincipal() principal: Principal,
  ): Promise<SessionResponseDto> {
    return toSessionResponse(await this.getSession.execute(principal.userId));
  }

  @Public()
  @RateLimit({
    name: 'auth-password-reset',
    limit: 20,
    windowSeconds: ONE_HOUR,
  })
  @Post('password-reset/request')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Solicita un enlace para recuperar la contraseña',
    description:
      'Responde 202 siempre, exista o no la cuenta. Si existe y el correo está configurado, llega un enlace de un solo uso (30 minutos).',
  })
  @ApiResponse({ status: HttpStatus.ACCEPTED })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  async requestPasswordReset(
    @Body() body: PasswordResetRequestDto,
    @ClientIp() ipAddress: string | null,
  ): Promise<void> {
    // An existing account does extra database work: level the time so it does not tell which one it was.
    await withMinimumDuration(PASSWORD_RESET_MIN_RESPONSE_MS, () =>
      this.requestReset.execute(body.email, ipAddress),
    );
  }

  @Public()
  @RateLimit({
    name: 'auth-password-confirm',
    limit: 20,
    windowSeconds: ONE_HOUR,
  })
  @Post('password-reset/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Crea una contraseña nueva con el enlace de recuperación',
    description: 'Cierra todas las sesiones abiertas del usuario.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'TOKEN_INVALID_OR_EXPIRED o WEAK_PASSWORD',
  })
  async confirmPasswordReset(
    @Body() body: PasswordResetConfirmDto,
    @ClientIp() ipAddress: string | null,
  ): Promise<void> {
    await this.confirmReset.execute({
      token: body.token,
      newPassword: body.newPassword,
      ipAddress,
    });
  }

  @Public()
  @RateLimit({
    name: 'auth-invitation',
    limit: 60,
    windowSeconds: FIFTEEN_MINUTES,
  })
  @Post('invitations/lookup')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Valida un enlace de invitación',
    description:
      'Permite mostrar el formulario "crea tu contraseña" solo si el enlace sirve. El token viaja en el cuerpo, no en la URL, para que no quede en los registros de acceso.',
  })
  @ApiResponse({ status: HttpStatus.OK, type: InvitationResponseDto })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'INVITATION_INVALID',
  })
  async invitation(
    @Body() body: InvitationLookupDto,
  ): Promise<InvitationResponseDto> {
    if (!TOKEN_PATTERN.test(body.token)) {
      throw new InvalidInvitationException();
    }
    return toInvitationResponse(await this.getInvitation.execute(body.token));
  }

  @Public()
  @RateLimit({
    name: 'auth-invitation-accept',
    limit: 20,
    windowSeconds: ONE_HOUR,
  })
  @Post('invitations/accept')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Acepta una invitación y crea la contraseña',
    description: 'Activa la cuenta y verifica el correo. No inicia sesión.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'INVITATION_INVALID',
  })
  @ApiResponse({ status: HttpStatus.BAD_REQUEST, description: 'WEAK_PASSWORD' })
  async acceptInvitationLink(
    @Body() body: AcceptInvitationDto,
    @ClientIp() ipAddress: string | null,
  ): Promise<void> {
    await this.acceptInvitation.execute({
      token: body.token,
      password: body.password,
      ipAddress,
    });
  }

  @Public()
  @RateLimit({
    name: 'auth-email-verification-confirm',
    limit: 20,
    windowSeconds: ONE_HOUR,
  })
  @Post('email-verification/confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Confirma el correo con el enlace recibido',
    description:
      'Marca el correo como verificado y consume el token (un solo uso, vence a las 72 horas). El token viaja en el cuerpo, no en la URL. No inicia sesión.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'TOKEN_INVALID_OR_EXPIRED',
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  async confirmEmailVerification(
    @Body() body: EmailVerificationConfirmDto,
    @ClientIp() ipAddress: string | null,
  ): Promise<void> {
    await this.confirmEmail.execute({ token: body.token, ipAddress });
  }

  @Post('email-verification/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth()
  @RateLimit({
    name: 'auth-email-verification-resend',
    limit: 20,
    windowSeconds: ONE_HOUR,
    failure: 'closed',
  })
  @ApiOperation({
    summary: 'Reenvía el enlace de confirmación del correo',
    description:
      'Para el usuario autenticado, incluso con el correo sin confirmar. Responde 202 siempre; el enlace anterior deja de servir. Máximo 5 por hora y usuario. `devVerificationLink` solo se devuelve en desarrollo, sin SMTP configurado.',
  })
  @ApiResponse({
    status: HttpStatus.ACCEPTED,
    type: EmailVerificationResendResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'RATE_LIMITED',
  })
  async resendEmailVerification(
    @CurrentPrincipal() principal: Principal,
    @ClientIp() ipAddress: string | null,
  ): Promise<EmailVerificationResendResponseDto> {
    return this.resendEmail.execute({ userId: principal.userId, ipAddress });
  }

  @Post('change-password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Cambia la contraseña del usuario autenticado',
    description: 'Cierra las demás sesiones; la actual sigue abierta.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'INVALID_CURRENT_PASSWORD o WEAK_PASSWORD',
  })
  async changePassword(
    @Body() body: ChangePasswordDto,
    @CurrentPrincipal() principal: Principal,
    @ClientIp() ipAddress: string | null,
  ): Promise<void> {
    await this.changePasswordUseCase.execute({
      userId: principal.userId,
      sessionId: principal.sessionId,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      ipAddress,
    });
  }
}
