import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import {
  CongregationInputValidator,
  CreateCongregationUseCase,
  ListCongregationsUseCase,
  ListSelectableCongregationsUseCase,
  SetAcceptsApplicationsUseCase,
  SetCongregationActiveUseCase,
  UpdateCongregationUseCase,
} from './application/congregations.use-cases.js';
import {
  CreateDistrictUseCase,
  ListDistrictsUseCase,
  UpdateDistrictUseCase,
} from './application/districts.use-cases.js';
import {
  CreateLegalEntityUseCase,
  LegalEntityInputValidator,
  ListLegalEntitiesUseCase,
  SetLegalEntityActiveUseCase,
  UpdateLegalEntityUseCase,
} from './application/legal-entities.use-cases.js';
import {
  CreatePlatformLegalEntityUseCase,
  ListPlatformLegalEntitiesUseCase,
  SetPlatformLegalEntityActiveUseCase,
  UpdatePlatformLegalEntityUseCase,
} from './application/platform-legal-entities.use-cases.js';
import {
  GetCongregationFormOptionsUseCase,
  GetOrganizationOverviewUseCase,
} from './application/organization-queries.use-cases.js';
import {
  CONGREGATION_REPOSITORY,
  DISTRICT_REPOSITORY,
  GEO_REPOSITORY,
  LEGAL_ENTITY_REPOSITORY,
  ORGANIZATION_OVERVIEW_READER,
  PLATFORM_LEGAL_ENTITY_READER,
} from './application/organization.ports.js';
import { PrismaCongregationRepository } from './infrastructure/prisma-congregation.repository.js';
import { PrismaDistrictRepository } from './infrastructure/prisma-district.repository.js';
import { PrismaGeoRepository } from './infrastructure/prisma-geo.repository.js';
import { PrismaLegalEntityRepository } from './infrastructure/prisma-legal-entity.repository.js';
import { PrismaOrganizationOverviewReader } from './infrastructure/prisma-organization-overview.reader.js';
import { PrismaPlatformLegalEntityReader } from './infrastructure/prisma-platform-legal-entity.reader.js';
import {
  CongregationsController,
  DistrictsController,
  LegalEntitiesController,
  OrganizationController,
  SelectableCongregationsController,
} from './presentation/organization.controllers.js';
import { PlatformLegalEntitiesController } from './presentation/platform-legal-entities.controller.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    OrganizationController,
    CongregationsController,
    LegalEntitiesController,
    DistrictsController,
    SelectableCongregationsController,
    PlatformLegalEntitiesController,
  ],
  providers: [
    GetOrganizationOverviewUseCase,
    GetCongregationFormOptionsUseCase,
    ListCongregationsUseCase,
    ListSelectableCongregationsUseCase,
    CongregationInputValidator,
    CreateCongregationUseCase,
    UpdateCongregationUseCase,
    SetCongregationActiveUseCase,
    SetAcceptsApplicationsUseCase,
    ListLegalEntitiesUseCase,
    LegalEntityInputValidator,
    CreateLegalEntityUseCase,
    UpdateLegalEntityUseCase,
    SetLegalEntityActiveUseCase,
    ListPlatformLegalEntitiesUseCase,
    CreatePlatformLegalEntityUseCase,
    UpdatePlatformLegalEntityUseCase,
    SetPlatformLegalEntityActiveUseCase,
    ListDistrictsUseCase,
    CreateDistrictUseCase,
    UpdateDistrictUseCase,
    {
      provide: CONGREGATION_REPOSITORY,
      useClass: PrismaCongregationRepository,
    },
    { provide: LEGAL_ENTITY_REPOSITORY, useClass: PrismaLegalEntityRepository },
    {
      provide: PLATFORM_LEGAL_ENTITY_READER,
      useClass: PrismaPlatformLegalEntityReader,
    },
    { provide: DISTRICT_REPOSITORY, useClass: PrismaDistrictRepository },
    { provide: GEO_REPOSITORY, useClass: PrismaGeoRepository },
    {
      provide: ORGANIZATION_OVERVIEW_READER,
      useClass: PrismaOrganizationOverviewReader,
    },
  ],
  exports: [GEO_REPOSITORY],
})
export class OrganizationModule {}
