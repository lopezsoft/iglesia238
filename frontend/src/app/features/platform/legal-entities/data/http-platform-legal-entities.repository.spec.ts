import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpPlatformLegalEntitiesRepository } from './http-platform-legal-entities.repository';
import { PlatformLegalEntityInput, PlatformLegalEntityRow } from './platform-legal-entities.models';
import { PlatformLegalEntitiesRepository } from './platform-legal-entities.repository';

const ROW: PlatformLegalEntityRow = {
  id: 7,
  denominationId: 2,
  denominationName: 'Iglesia Cristiana Monte de Sión',
  legalName: 'Corporación Iglesia Monte de Sión',
  tradeName: null,
  taxId: '900.123.456-7',
  legalRepresentative: 'Ana Pérez',
  email: null,
  phone: null,
  address: null,
  countryId: 1,
  countryName: 'Colombia',
  municipalityCode: '25175',
  isActive: true,
  congregationCount: 2,
};

const INPUT: PlatformLegalEntityInput = {
  legalName: ROW.legalName,
  tradeName: null,
  taxId: ROW.taxId,
  legalRepresentative: 'Ana Pérez',
  email: null,
  phone: null,
  address: null,
  countryId: 1,
  municipalityCode: '25175',
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: PlatformLegalEntitiesRepository, useClass: HttpPlatformLegalEntitiesRepository },
    ],
  });
  return {
    repository: TestBed.inject(PlatformLegalEntitiesRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpPlatformLegalEntitiesRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists every legal entity, or only the ones of the filtered church', async () => {
    const { repository, backend } = setup();

    const all = firstValueFrom(repository.list(null));
    const allRequest = backend.expectOne('/api/platform/legal-entities');
    expect(allRequest.request.method).toBe('GET');
    expect(allRequest.request.params.keys()).toEqual([]);
    allRequest.flush([ROW]);
    expect(await all).toEqual([ROW]);

    const filtered = firstValueFrom(repository.list(2));
    const filteredRequest = backend.expectOne((req) => req.url === '/api/platform/legal-entities');
    expect(filteredRequest.request.params.get('denominationId')).toBe('2');
    filteredRequest.flush([ROW]);
    await filtered;
  });

  it('creates with the church, edits without it and toggles the status', async () => {
    const { repository, backend } = setup();

    const created = firstValueFrom(repository.create({ ...INPUT, denominationId: 2 }));
    const create = backend.expectOne('/api/platform/legal-entities');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ ...INPUT, denominationId: 2 });
    create.flush(ROW);
    await created;

    const updated = firstValueFrom(repository.update(7, INPUT));
    const update = backend.expectOne('/api/platform/legal-entities/7');
    expect(update.request.method).toBe('PATCH');
    expect(update.request.body).toEqual(INPUT);
    update.flush(ROW);
    await updated;

    const moved = firstValueFrom(repository.update(7, { ...INPUT, countryId: 2, municipalityCode: null }));
    const move = backend.expectOne('/api/platform/legal-entities/7');
    expect(move.request.body).toEqual({ ...INPUT, countryId: 2, municipalityCode: null });
    move.flush({ ...ROW, countryId: 2, countryName: 'Otro país', municipalityCode: null });
    expect((await moved).countryName).toBe('Otro país');

    const toggled = firstValueFrom(repository.setActive(7, false));
    const status = backend.expectOne('/api/platform/legal-entities/7/status');
    expect(status.request.method).toBe('PATCH');
    expect(status.request.body).toEqual({ isActive: false });
    status.flush({ ...ROW, isActive: false });
    expect((await toggled).isActive).toBe(false);
  });
});
