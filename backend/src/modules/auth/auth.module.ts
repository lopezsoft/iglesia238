import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { parseDurationSeconds } from '../../config/duration.js';
import { Environment, isSecureDeployment } from '../../config/environment.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import {
  AUTH_SETTINGS,
  type AuthSettings,
} from './application/auth.settings.js';
import { ChangePasswordUseCase } from './application/change-password.use-case.js';
import { ConfirmPasswordResetUseCase } from './application/confirm-password-reset.use-case.js';
import {
  ConfirmEmailVerificationUseCase,
  ResendEmailVerificationUseCase,
} from './application/email-verification.use-cases.js';
import { GetSessionUseCase } from './application/get-session.use-case.js';
import {
  AcceptInvitationUseCase,
  GetInvitationUseCase,
  InvitationResolver,
} from './application/invitations.use-cases.js';
import { LoginUseCase } from './application/login.use-case.js';
import { LogoutUseCase } from './application/logout.use-case.js';
import { AUTH_ACCOUNT_REPOSITORY } from './application/ports/auth-account.repository.js';
import { REFRESH_TOKEN_REPOSITORY } from './application/ports/refresh-token.repository.js';
import { SESSION_PROFILE_READER } from './application/ports/session-profile.reader.js';
import { USER_TOKEN_REPOSITORY } from './application/ports/user-token.repository.js';
import { RefreshSessionUseCase } from './application/refresh-session.use-case.js';
import { RequestPasswordResetUseCase } from './application/request-password-reset.use-case.js';
import { SessionTokenIssuer } from './application/session-token.issuer.js';
import { PrismaAuthAccountRepository } from './infrastructure/prisma-auth-account.repository.js';
import { PrismaRefreshTokenRepository } from './infrastructure/prisma-refresh-token.repository.js';
import { PrismaSessionProfileReader } from './infrastructure/prisma-session-profile.reader.js';
import { PrismaUserTokenRepository } from './infrastructure/prisma-user-token.repository.js';
import { AuthController } from './presentation/auth.controller.js';

/**
 * Authentication: sign-in with a rotating refresh cookie, the session of the user, password recovery,
 * invitations and password change. Tokens and hashing come from the global FoundationModule.
 */
@Module({
  imports: [PrismaModule],
  controllers: [AuthController],
  providers: [
    {
      provide: AUTH_SETTINGS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): AuthSettings => ({
        refreshTtlSeconds: parseDurationSeconds(
          config.get('REFRESH_TTL', { infer: true }),
        ),
        refreshMaxLifetimeSeconds: parseDurationSeconds(
          config.get('REFRESH_MAX_LIFETIME', { infer: true }),
        ),
        appBaseUrl: config
          .get('APP_BASE_URL', { infer: true })
          .replace(/\/+$/, ''),
        cookieSecure: isSecureDeployment({
          NODE_ENV: config.get('NODE_ENV', { infer: true }),
          APP_BASE_URL: config.get('APP_BASE_URL', { infer: true }),
        }),
      }),
    },
    { provide: AUTH_ACCOUNT_REPOSITORY, useClass: PrismaAuthAccountRepository },
    {
      provide: REFRESH_TOKEN_REPOSITORY,
      useClass: PrismaRefreshTokenRepository,
    },
    { provide: USER_TOKEN_REPOSITORY, useClass: PrismaUserTokenRepository },
    { provide: SESSION_PROFILE_READER, useClass: PrismaSessionProfileReader },
    SessionTokenIssuer,
    LoginUseCase,
    RefreshSessionUseCase,
    LogoutUseCase,
    GetSessionUseCase,
    RequestPasswordResetUseCase,
    ConfirmPasswordResetUseCase,
    InvitationResolver,
    GetInvitationUseCase,
    AcceptInvitationUseCase,
    ChangePasswordUseCase,
    ConfirmEmailVerificationUseCase,
    ResendEmailVerificationUseCase,
  ],
})
export class AuthModule {}
