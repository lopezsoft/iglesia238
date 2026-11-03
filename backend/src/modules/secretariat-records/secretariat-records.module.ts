import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { MembershipModule } from '../membership/membership.module.js';
import {
  CHILD_DEDICATION_REPOSITORY,
  CONGREGATION_DIRECTORY,
  MARRIAGE_REPOSITORY,
  PASTORAL_TERM_REPOSITORY,
  PEOPLE_DIRECTORY,
  PEOPLE_SEARCH,
} from './application/ports/records.ports.js';
import {
  GetChildDedication,
  ListChildDedications,
  RecordChildDedication,
} from './application/use-cases/child-dedication.use-cases.js';
import {
  DissolveMarriage,
  GetMarriage,
  ListMarriages,
  RecordMarriage,
} from './application/use-cases/marriage.use-cases.js';
import {
  ClosePastoralTerm,
  ListPastoralTerms,
  RecordPastoralTerm,
} from './application/use-cases/pastoral-term.use-cases.js';
import {
  GetRecordsContext,
  GetRecordsSummary,
  SearchRecordPeople,
} from './application/use-cases/records-overview.use-cases.js';
import { MembershipPeopleSearch } from './infrastructure/membership-people-search.js';
import {
  PrismaCongregationDirectory,
  PrismaPeopleDirectory,
} from './infrastructure/prisma-directories.js';
import { PrismaChildDedicationRepository } from './infrastructure/prisma-child-dedication.repository.js';
import { PrismaMarriageRepository } from './infrastructure/prisma-marriage.repository.js';
import { PrismaPastoralTermRepository } from './infrastructure/prisma-pastoral-term.repository.js';
import {
  ChildDedicationsController,
  MarriagesController,
  PastoralTermsController,
  SecretariatRecordsController,
} from './presentation/records.controllers.js';

/**
 * Secretariat records (D-04, D-05): presentations of children, marriages and pastoral terms.
 * Transactions, audit and the clock come from the global FoundationModule; the people search is the
 * shared SearchPeople use case of the membership module.
 */
@Module({
  imports: [PrismaModule, MembershipModule],
  controllers: [
    SecretariatRecordsController,
    ChildDedicationsController,
    MarriagesController,
    PastoralTermsController,
  ],
  providers: [
    { provide: CONGREGATION_DIRECTORY, useClass: PrismaCongregationDirectory },
    { provide: PEOPLE_DIRECTORY, useClass: PrismaPeopleDirectory },
    { provide: PEOPLE_SEARCH, useClass: MembershipPeopleSearch },
    {
      provide: CHILD_DEDICATION_REPOSITORY,
      useClass: PrismaChildDedicationRepository,
    },
    { provide: MARRIAGE_REPOSITORY, useClass: PrismaMarriageRepository },
    {
      provide: PASTORAL_TERM_REPOSITORY,
      useClass: PrismaPastoralTermRepository,
    },
    GetRecordsContext,
    GetRecordsSummary,
    SearchRecordPeople,
    ListChildDedications,
    GetChildDedication,
    RecordChildDedication,
    ListMarriages,
    GetMarriage,
    RecordMarriage,
    DissolveMarriage,
    ListPastoralTerms,
    RecordPastoralTerm,
    ClosePastoralTerm,
  ],
})
export class SecretariatRecordsModule {}
