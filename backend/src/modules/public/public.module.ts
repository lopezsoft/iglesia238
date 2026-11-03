import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { PUBLIC_APPLICATIONS_STORE } from './application/ports/public-applications.store.js';
import { PUBLIC_DIRECTORY } from './application/ports/public-directory.reader.js';
import {
  CheckApplicationStatusUseCase,
  GetCurrentPolicyUseCase,
  ListOpenCongregationsUseCase,
} from './application/public-reads.use-cases.js';
import { SubmitApplicationUseCase } from './application/submit-application.use-case.js';
import { PrismaPublicApplicationsStore } from './infrastructure/prisma-public-applications.store.js';
import { PrismaPublicDirectory } from './infrastructure/prisma-public-directory.js';
import { PublicController } from './presentation/public.controller.js';

/** Anonymous membership form: sedes, policy, submission and status by tracking code. */
@Module({
  imports: [PrismaModule],
  controllers: [PublicController],
  providers: [
    { provide: PUBLIC_DIRECTORY, useClass: PrismaPublicDirectory },
    {
      provide: PUBLIC_APPLICATIONS_STORE,
      useClass: PrismaPublicApplicationsStore,
    },
    ListOpenCongregationsUseCase,
    GetCurrentPolicyUseCase,
    SubmitApplicationUseCase,
    CheckApplicationStatusUseCase,
  ],
})
export class PublicModule {}
