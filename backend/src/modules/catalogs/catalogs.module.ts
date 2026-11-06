import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import {
  CATALOGS_READER,
  PLATFORM_COUNTRY_STORE,
} from './application/catalogs.reader.js';
import {
  EnsureNeighborhoodUseCase,
  GetCatalogsUseCase,
  GetMunicipalityUseCase,
  ListCountriesUseCase,
  ListNeighborhoodsUseCase,
  ListRegionsUseCase,
  SearchMunicipalitiesUseCase,
} from './application/catalogs.use-cases.js';
import {
  ListPlatformCountriesUseCase,
  SetCountryActiveUseCase,
} from './application/platform-countries.use-cases.js';
import { PrismaCatalogsReader } from './infrastructure/prisma-catalogs.reader.js';
import { PrismaPlatformCountryStore } from './infrastructure/prisma-platform-country.store.js';
import {
  CatalogsController,
  GeoController,
  PlatformCountriesController,
  PublicCatalogsController,
} from './presentation/catalogs.controllers.js';

/**
 * Global catalogs and geography (countries, regions, municipalities, neighborhoods), with the public
 * subset for the apply form, and the platform administration of the active countries.
 */
@Module({
  imports: [PrismaModule],
  controllers: [
    CatalogsController,
    GeoController,
    PublicCatalogsController,
    PlatformCountriesController,
  ],
  providers: [
    { provide: CATALOGS_READER, useClass: PrismaCatalogsReader },
    { provide: PLATFORM_COUNTRY_STORE, useClass: PrismaPlatformCountryStore },
    GetCatalogsUseCase,
    ListCountriesUseCase,
    ListRegionsUseCase,
    ListPlatformCountriesUseCase,
    SetCountryActiveUseCase,
    SearchMunicipalitiesUseCase,
    GetMunicipalityUseCase,
    ListNeighborhoodsUseCase,
    EnsureNeighborhoodUseCase,
  ],
})
export class CatalogsModule {}
