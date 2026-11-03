import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { CONGREGATION_REGISTRATION_STORE } from './application/ports/congregation-registration.store.js';
import { PUBLIC_APPLICATIONS_STORE } from './application/ports/public-applications.store.js';
import { PUBLIC_DIRECTORY } from './application/ports/public-directory.reader.js';
import {
  CheckApplicationStatusUseCase,
  GetCurrentPolicyUseCase,
  ListOpenCongregationsUseCase,
  ListPublicLegalEntitiesUseCase,
} from './application/public-reads.use-cases.js';
import {
  PUBLIC_REGISTRATION_SETTINGS,
  type PublicRegistrationSettings,
} from './application/public-registration.settings.js';
import { RegisterCongregationUseCase } from './application/register-congregation.use-case.js';
import { SubmitApplicationUseCase } from './application/submit-application.use-case.js';
import { PrismaCongregationRegistrationStore } from './infrastructure/prisma-congregation-registration.store.js';
import { PrismaPublicApplicationsStore } from './infrastructure/prisma-public-applications.store.js';
import { PrismaPublicDirectory } from './infrastructure/prisma-public-directory.js';
import { PublicController } from './presentation/public.controller.js';

/**
 * Anonymous endpoints: the membership form (sedes, policy, submission and status by tracking code) and
 * the self-registration of a congregation under an existing legal entity.
 */
@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
  providers: [
    { provide: PUBLIC_DIRECTORY, useClass: PrismaPublicDirectory },
    {
      provide: PUBLIC_APPLICATIONS_STORE,
      useClass: PrismaPublicApplicationsStore,
    },
    {
      provide: CONGREGATION_REGISTRATION_STORE,
      useClass: PrismaCongregationRegistrationStore,
    },
    {
      provide: PUBLIC_REGISTRATION_SETTINGS,
      inject: [ConfigService],
      useFactory: (
        config: ConfigService<Environment, true>,
      ): PublicRegistrationSettings => ({
        appBaseUrl: config
          .get('APP_BASE_URL', { infer: true })
          .replace(/\/+$/, ''),
      }),
    },
    ListOpenCongregationsUseCase,
    ListPublicLegalEntitiesUseCase,
    GetCurrentPolicyUseCase,
    SubmitApplicationUseCase,
    CheckApplicationStatusUseCase,
    RegisterCongregationUseCase,
  ],
})
export class PublicModule {}
