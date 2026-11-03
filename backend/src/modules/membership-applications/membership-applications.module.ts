import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { ApplicationAssembler } from './application/application.assembler.js';
import { ApproveApplicationUseCase } from './application/approve-application.use-case.js';
import { GetApplicationUseCase } from './application/get-application.use-case.js';
import { ListApplicationsUseCase } from './application/list-applications.use-case.js';
import { MarkDuplicateUseCase } from './application/mark-duplicate.use-case.js';
import { APPLICATIONS_REPOSITORY } from './application/ports/applications.repository.js';
import { MEMBERSHIP_REGISTRY } from './application/ports/membership-registry.port.js';
import { RejectApplicationUseCase } from './application/reject-application.use-case.js';
import { StartReviewUseCase } from './application/start-review.use-case.js';
import { PrismaApplicationsRepository } from './infrastructure/prisma-applications.repository.js';
import { PrismaMembershipRegistry } from './infrastructure/prisma-membership-registry.js';
import { MembershipApplicationsController } from './presentation/membership-applications.controller.js';

/** Review of the membership applications: queue, decisions and the transactional approval. */
@Module({
  imports: [PrismaModule],
  controllers: [MembershipApplicationsController],
  providers: [
    {
      provide: APPLICATIONS_REPOSITORY,
      useClass: PrismaApplicationsRepository,
    },
    { provide: MEMBERSHIP_REGISTRY, useClass: PrismaMembershipRegistry },
    ApplicationAssembler,
    ListApplicationsUseCase,
    GetApplicationUseCase,
    StartReviewUseCase,
    RejectApplicationUseCase,
    MarkDuplicateUseCase,
    ApproveApplicationUseCase,
  ],
})
export class MembershipApplicationsModule {}
