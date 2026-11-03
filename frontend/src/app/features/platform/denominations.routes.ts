import { Routes } from '@angular/router';
import { DenominationsRepository } from './denominations/data/denominations.repository';
import { HttpDenominationsRepository } from './denominations/data/http-denominations.repository';
import { HttpPlatformCountriesRepository } from './countries/data/http-platform-countries.repository';
import { PlatformCountriesRepository } from './countries/data/platform-countries.repository';
import { HttpPlatformLegalEntitiesRepository } from './legal-entities/data/http-platform-legal-entities.repository';
import { PlatformLegalEntitiesRepository } from './legal-entities/data/platform-legal-entities.repository';

export default [
  {
    path: '',
    providers: [
      { provide: DenominationsRepository, useClass: HttpDenominationsRepository },
      { provide: PlatformLegalEntitiesRepository, useClass: HttpPlatformLegalEntitiesRepository },
      { provide: PlatformCountriesRepository, useClass: HttpPlatformCountriesRepository },
    ],
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./denominations/denominations.page').then((m) => m.DenominationsPage),
      },
    ],
  },
] satisfies Routes;
