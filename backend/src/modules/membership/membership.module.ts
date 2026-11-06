import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import {
  CONSENT_REPOSITORY,
  FAMILY_REPOSITORY,
  PEOPLE_SEARCH_REPOSITORY,
  POSITION_REPOSITORY,
  REGISTRY_REPOSITORY,
  SOCIOECONOMIC_REPOSITORY,
  STUDY_REPOSITORY,
} from './application/ports/member-details.repositories.js';
import { MEMBER_REPOSITORY } from './application/ports/member.repository.js';
import {
  CATALOG_RESOLVER,
  PERSON_REPOSITORY,
} from './application/ports/person.repository.js';
import { CreateMemberUseCase } from './application/use-cases/create-member.use-case.js';
import {
  ExportMembersUseCase,
  ListMembersUseCase,
} from './application/use-cases/list-members.use-case.js';
import {
  AddFamilyRelationUseCase,
  ListFamilyUseCase,
  RemoveFamilyRelationUseCase,
  UpdateFamilyRelationUseCase,
} from './application/use-cases/member-family.use-cases.js';
import {
  ChangeMemberStatusUseCase,
  GetMemberRegistryUseCase,
  ListTransferDestinationsUseCase,
  TransferMemberUseCase,
} from './application/use-cases/member-lifecycle.use-cases.js';
import {
  AssignPositionUseCase,
  ClosePositionUseCase,
  GetMemberPositionsUseCase,
  ListPositionCatalogsUseCase,
  SetPastoralRankUseCase,
} from './application/use-cases/member-positions.use-cases.js';
import {
  GetMemberUseCase,
  UpdateMemberPersonUseCase,
  UpdateMembershipDataUseCase,
} from './application/use-cases/member-profile.use-cases.js';
import {
  AnonymizeMemberUseCase,
  GetSocioeconomicProfileUseCase,
  ListConsentsUseCase,
  RevokeConsentUseCase,
  SaveSocioeconomicProfileUseCase,
} from './application/use-cases/member-sensitive.use-cases.js';
import {
  AddStudyUseCase,
  ListStudiesUseCase,
  RemoveStudyUseCase,
  UpdateStudyUseCase,
} from './application/use-cases/member-studies.use-cases.js';
import {
  SearchFamilyCandidatesUseCase,
  SearchPeopleUseCase,
} from './application/use-cases/search-people.use-case.js';
import {
  PrismaFamilyRepository,
  PrismaStudyRepository,
} from './infrastructure/prisma-family-study.repositories.js';
import { PrismaMemberRepository } from './infrastructure/prisma-member.repository.js';
import { PrismaPeopleSearchRepository } from './infrastructure/prisma-people-search.repository.js';
import {
  PrismaCatalogResolver,
  PrismaPersonRepository,
} from './infrastructure/prisma-person.repository.js';
import {
  PrismaPositionRepository,
  PrismaSocioeconomicRepository,
} from './infrastructure/prisma-position-profile.repositories.js';
import {
  PrismaConsentRepository,
  PrismaRegistryRepository,
} from './infrastructure/prisma-registry-consent.repositories.js';
import { MemberDetailsController } from './presentation/member-details.controller.js';
import { MemberSensitiveController } from './presentation/member-sensitive.controller.js';
import { MembersController } from './presentation/members.controller.js';
import {
  MembershipCatalogsController,
  PeopleLookupController,
} from './presentation/people-lookup.controller.js';

const USE_CASES = [
  ListMembersUseCase,
  ExportMembersUseCase,
  GetMemberUseCase,
  CreateMemberUseCase,
  UpdateMemberPersonUseCase,
  UpdateMembershipDataUseCase,
  ChangeMemberStatusUseCase,
  TransferMemberUseCase,
  GetMemberRegistryUseCase,
  ListTransferDestinationsUseCase,
  ListFamilyUseCase,
  AddFamilyRelationUseCase,
  UpdateFamilyRelationUseCase,
  RemoveFamilyRelationUseCase,
  ListStudiesUseCase,
  AddStudyUseCase,
  UpdateStudyUseCase,
  RemoveStudyUseCase,
  GetMemberPositionsUseCase,
  ListPositionCatalogsUseCase,
  AssignPositionUseCase,
  ClosePositionUseCase,
  SetPastoralRankUseCase,
  GetSocioeconomicProfileUseCase,
  SaveSocioeconomicProfileUseCase,
  ListConsentsUseCase,
  RevokeConsentUseCase,
  AnonymizeMemberUseCase,
  SearchPeopleUseCase,
  SearchFamilyCandidatesUseCase,
];

/**
 * Members of the church: list, file (personal data, family, studies, positions, socioeconomic
 * profile, registry and transfers, data consents), manual registration, status changes and the
 * unified people search. Other modules reuse `SearchPeopleUseCase` and `CreateMemberUseCase`.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    MembersController,
    MemberDetailsController,
    MemberSensitiveController,
    PeopleLookupController,
    MembershipCatalogsController,
  ],
  providers: [
    ...USE_CASES,
    { provide: MEMBER_REPOSITORY, useClass: PrismaMemberRepository },
    { provide: PERSON_REPOSITORY, useClass: PrismaPersonRepository },
    { provide: CATALOG_RESOLVER, useClass: PrismaCatalogResolver },
    { provide: FAMILY_REPOSITORY, useClass: PrismaFamilyRepository },
    { provide: STUDY_REPOSITORY, useClass: PrismaStudyRepository },
    { provide: POSITION_REPOSITORY, useClass: PrismaPositionRepository },
    {
      provide: SOCIOECONOMIC_REPOSITORY,
      useClass: PrismaSocioeconomicRepository,
    },
    { provide: REGISTRY_REPOSITORY, useClass: PrismaRegistryRepository },
    { provide: CONSENT_REPOSITORY, useClass: PrismaConsentRepository },
    {
      provide: PEOPLE_SEARCH_REPOSITORY,
      useClass: PrismaPeopleSearchRepository,
    },
  ],
  exports: [SearchPeopleUseCase, CreateMemberUseCase, MEMBER_REPOSITORY],
})
export class MembershipModule {}
