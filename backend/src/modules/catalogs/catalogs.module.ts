import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { CATALOGS_READER } from './application/catalogs.reader.js';
import {
  EnsureNeighborhoodUseCase,
  GetCatalogsUseCase,
  GetMunicipalityUseCase,
  ListNeighborhoodsUseCase,
  SearchMunicipalitiesUseCase,
} from './application/catalogs.use-cases.js';
import { PrismaCatalogsReader } from './infrastructure/prisma-catalogs.reader.js';
import {
  CatalogsController,
  GeoController,
  PublicCatalogsController,
} from './presentation/catalogs.controllers.js';

/** Global catalogs and geography (municipalities, neighborhoods), with the public subset for the apply form. */
@Module({
  imports: [PrismaModule],
  controllers: [CatalogsController, GeoController, PublicCatalogsController],
  providers: [
    { provide: CATALOGS_READER, useClass: PrismaCatalogsReader },
    GetCatalogsUseCase,
    SearchMunicipalitiesUseCase,
    GetMunicipalityUseCase,
    ListNeighborhoodsUseCase,
    EnsureNeighborhoodUseCase,
  ],
})
export class CatalogsModule {}
