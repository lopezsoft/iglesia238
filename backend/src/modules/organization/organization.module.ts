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
  GetCongregationFormOptionsUseCase,
  GetOrganizationOverviewUseCase,
} from './application/organization-queries.use-cases.js';
import {
  CONGREGATION_REPOSITORY,
  DISTRICT_REPOSITORY,
  GEO_REPOSITORY,
  LEGAL_ENTITY_REPOSITORY,
  ORGANIZATION_OVERVIEW_READER,
} from './application/organization.ports.js';
import { PrismaCongregationRepository } from './infrastructure/prisma-congregation.repository.js';
import { PrismaDistrictRepository } from './infrastructure/prisma-district.repository.js';
import { PrismaGeoRepository } from './infrastructure/prisma-geo.repository.js';
import { PrismaLegalEntityRepository } from './infrastructure/prisma-legal-entity.repository.js';
import { PrismaOrganizationOverviewReader } from './infrastructure/prisma-organization-overview.reader.js';
import {
  CongregationsController,
  DistrictsController,
  LegalEntitiesController,
  OrganizationController,
  SelectableCongregationsController,
} from './presentation/organization.controllers.js';

@Module({
  imports: [PrismaModule],
  controllers: [
    OrganizationController,
    CongregationsController,
    LegalEntitiesController,
    DistrictsController,
    SelectableCongregationsController,
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
    ListDistrictsUseCase,
    CreateDistrictUseCase,
    UpdateDistrictUseCase,
    {
      provide: CONGREGATION_REPOSITORY,
      useClass: PrismaCongregationRepository,
    },
    { provide: LEGAL_ENTITY_REPOSITORY, useClass: PrismaLegalEntityRepository },
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
