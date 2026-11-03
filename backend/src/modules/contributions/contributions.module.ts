import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { MembershipModule } from '../membership/membership.module.js';
import { VowsModule } from '../vows/vows.module.js';
import { CONTRIBUTIONS_REPOSITORY } from './application/contributions.repository.js';
import { ExportContributionsUseCase } from './application/export-contributions.use-case.js';
import { GetContributionFormOptionsUseCase } from './application/get-contribution-form-options.use-case.js';
import { GetContributionUseCase } from './application/get-contribution.use-case.js';
import { ListContributionsUseCase } from './application/list-contributions.use-case.js';
import { RecordContributionUseCase } from './application/record-contribution.use-case.js';
import {
  CONTRIBUTOR_SEARCH,
  SearchContributorsUseCase,
} from './application/search-contributors.use-case.js';
import { VoidContributionUseCase } from './application/void-contribution.use-case.js';
import { PrismaContributionsRepository } from './infrastructure/prisma-contributions.repository.js';
import { MembershipContributorSearch } from './infrastructure/membership-contributor-search.js';
import {
  ContributionsController,
  ContributorsController,
} from './presentation/contributions.controller.js';

/** Aportes: registro con recibo, anulación, listados y buscador de aportantes. */
@Module({
  imports: [PrismaModule, VowsModule, MembershipModule],
  controllers: [ContributionsController, ContributorsController],
  providers: [
    PrismaContributionsRepository,
    MembershipContributorSearch,
    {
      provide: CONTRIBUTIONS_REPOSITORY,
      useExisting: PrismaContributionsRepository,
    },
    {
      provide: CONTRIBUTOR_SEARCH,
      useExisting: MembershipContributorSearch,
    },
    GetContributionFormOptionsUseCase,
    ListContributionsUseCase,
    GetContributionUseCase,
    ExportContributionsUseCase,
    RecordContributionUseCase,
    VoidContributionUseCase,
    SearchContributorsUseCase,
  ],
})
export class ContributionsModule {}
