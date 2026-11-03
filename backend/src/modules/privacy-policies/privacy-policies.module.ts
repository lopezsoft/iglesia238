import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { PRIVACY_POLICIES_REPOSITORY } from './application/ports/privacy-policies.repository.js';
import {
  CreatePrivacyPolicyUseCase,
  DeletePrivacyPolicyUseCase,
  ListPrivacyPoliciesUseCase,
  PublishPrivacyPolicyUseCase,
  UpdatePrivacyPolicyUseCase,
} from './application/privacy-policies.use-cases.js';
import { PrismaPrivacyPoliciesRepository } from './infrastructure/prisma-privacy-policies.repository.js';
import { PrivacyPoliciesController } from './presentation/privacy-policies.controller.js';

/** Versions of the data-processing policy of a denomination: draft, publish, consult. */
@Module({
  imports: [PrismaModule],
  controllers: [PrivacyPoliciesController],
  providers: [
    {
      provide: PRIVACY_POLICIES_REPOSITORY,
      useClass: PrismaPrivacyPoliciesRepository,
    },
    ListPrivacyPoliciesUseCase,
    CreatePrivacyPolicyUseCase,
    UpdatePrivacyPolicyUseCase,
    DeletePrivacyPolicyUseCase,
    PublishPrivacyPolicyUseCase,
  ],
})
export class PrivacyPoliciesModule {}
