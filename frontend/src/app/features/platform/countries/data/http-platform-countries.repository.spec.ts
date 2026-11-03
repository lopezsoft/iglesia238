import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpPlatformCountriesRepository } from './http-platform-countries.repository';
import { PlatformCountryRow } from './platform-countries.models';
import { PlatformCountriesRepository } from './platform-countries.repository';

const COLOMBIA: PlatformCountryRow = {
  id: 1,
  isoAlpha2: 'CO',
  name: 'Colombia',
  isActive: true,
  hasMunicipalities: true,
  regionCount: 33,
  municipalityCount: 1122,
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PlatformCountriesRepository, useClass: HttpPlatformCountriesRepository },
    ],
  });
  return {
    repository: TestBed.inject(PlatformCountriesRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpPlatformCountriesRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists every country with its counters', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.list());
    const request = backend.expectOne('/api/platform/countries');
    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys()).toEqual([]);
    request.flush([COLOMBIA]);

    expect(await result).toEqual([COLOMBIA]);
  });

  it('changes the status of a country', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.setActive(1, false));
    const request = backend.expectOne('/api/platform/countries/1/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ isActive: false });
    request.flush({ ...COLOMBIA, isActive: false });

    expect((await result).isActive).toBe(false);
  });
});
