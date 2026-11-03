import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HttpOrganizationRepository } from './http-organization.repository';
import { CongregationInput, DistrictInput, LegalEntityInput } from './organization.models';
import { OrganizationRepository } from './organization.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: OrganizationRepository, useClass: HttpOrganizationRepository },
    ],
  });
  return {
    repository: TestBed.inject(OrganizationRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

const CONGREGATION: CongregationInput = {
  name: 'Sede Chía',
  legalEntityId: 1,
  districtId: null,
  municipalityCode: '13001',
  neighborhood: 'Centro',
  address: 'Calle 10 # 5-20',
  phone: null,
  email: null,
  acceptsApplications: true,
};

const LEGAL_ENTITY: LegalEntityInput = {
  legalName: 'Corporación Educativa',
  tradeName: null,
  taxId: '900.123.456-7',
  legalRepresentative: 'Representante',
  countryId: 1,
  municipalityCode: '11001',
  email: null,
  phone: null,
  address: null,
};

const DISTRICT: DistrictInput = { number: '2', name: 'Caribe' };

describe('HttpOrganizationRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the overview, the sedes and the form options', async () => {
    const { repository, backend } = setup();

    const overview = firstValueFrom(repository.overview());
    backend.expectOne('/api/organization/overview').flush({ denominationName: 'Monte de Sión' });
    expect((await overview).denominationName).toBe('Monte de Sión');

    const sedes = firstValueFrom(repository.listCongregations());
    backend.expectOne('/api/organization/congregations').flush([]);
    expect(await sedes).toEqual([]);

    const options = firstValueFrom(repository.congregationFormOptions());
    backend
      .expectOne('/api/organization/congregations/form-options')
      .flush({ legalEntities: [], districts: [] });
    backend.expectOne('/api/organization/legal-entities').flush([]);
    expect(await options).toEqual({ legalEntities: [], districts: [] });
  });

  it('completes the legal entities of the sede form with their country', async () => {
    const { repository, backend } = setup();

    const options = firstValueFrom(repository.congregationFormOptions());
    backend.expectOne('/api/organization/congregations/form-options').flush({
      legalEntities: [
        { id: 3, label: 'Corporación Monte de Sión', isActive: true },
        { id: 4, label: 'Sin datos', isActive: false },
      ],
      districts: [{ id: 2, label: 'Distrito 2', isActive: true }],
    });
    backend.expectOne('/api/organization/legal-entities').flush([{ id: 3, countryId: 1, countryName: 'Colombia' }]);

    expect(await options).toEqual({
      legalEntities: [
        { id: 3, label: 'Corporación Monte de Sión', isActive: true, countryId: 1, countryName: 'Colombia' },
        { id: 4, label: 'Sin datos', isActive: false, countryId: null, countryName: null },
      ],
      districts: [{ id: 2, label: 'Distrito 2', isActive: true }],
    });
  });

  it('creates and updates a sede with the contract bodies', async () => {
    const { repository, backend } = setup();

    const created = firstValueFrom(repository.createCongregation(CONGREGATION));
    const create = backend.expectOne('/api/organization/congregations');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(CONGREGATION);
    create.flush({ id: 7 });
    await created;

    const updated = firstValueFrom(repository.updateCongregation(7, CONGREGATION));
    const update = backend.expectOne('/api/organization/congregations/7');
    expect(update.request.method).toBe('PUT');
    update.flush({ id: 7 });
    await updated;
  });

  it('changes the status and the public applications of a sede', async () => {
    const { repository, backend } = setup();

    const status = firstValueFrom(repository.setCongregationActive(7, false));
    const statusRequest = backend.expectOne('/api/organization/congregations/7/status');
    expect(statusRequest.request.method).toBe('PATCH');
    expect(statusRequest.request.body).toEqual({ isActive: false });
    statusRequest.flush({ id: 7 });
    await status;

    const accepts = firstValueFrom(repository.setAcceptsApplications(7, true));
    const acceptsRequest = backend.expectOne('/api/organization/congregations/7/accepts-applications');
    expect(acceptsRequest.request.method).toBe('PATCH');
    expect(acceptsRequest.request.body).toEqual({ acceptsApplications: true });
    acceptsRequest.flush({ id: 7 });
    await accepts;
  });

  it('manages legal entities', async () => {
    const { repository, backend } = setup();

    const list = firstValueFrom(repository.listLegalEntities());
    backend.expectOne('/api/organization/legal-entities').flush([]);
    await list;

    const created = firstValueFrom(repository.createLegalEntity(LEGAL_ENTITY));
    const create = backend.expectOne('/api/organization/legal-entities');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(LEGAL_ENTITY);
    create.flush({ id: 3 });
    await created;

    const updated = firstValueFrom(repository.updateLegalEntity(3, LEGAL_ENTITY));
    const update = backend.expectOne('/api/organization/legal-entities/3');
    expect(update.request.method).toBe('PUT');
    expect(update.request.body).toEqual(LEGAL_ENTITY);
    update.flush({ id: 3 });
    await updated;
  });

  it('changes the status of a legal entity', async () => {
    const { repository, backend } = setup();

    const toggled = firstValueFrom(repository.setLegalEntityActive(3, false));
    const request = backend.expectOne('/api/organization/legal-entities/3/status');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ isActive: false });
    request.flush({ id: 3, isActive: false });
    expect((await toggled).isActive).toBe(false);
  });

  it('manages districts', async () => {
    const { repository, backend } = setup();

    const list = firstValueFrom(repository.listDistricts());
    backend.expectOne('/api/organization/districts').flush([]);
    await list;

    const created = firstValueFrom(repository.createDistrict(DISTRICT));
    const create = backend.expectOne('/api/organization/districts');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual(DISTRICT);
    create.flush({ id: 5 });
    await created;

    const updated = firstValueFrom(repository.updateDistrict(5, DISTRICT));
    const update = backend.expectOne('/api/organization/districts/5');
    expect(update.request.method).toBe('PUT');
    update.flush({ id: 5 });
    await updated;
  });
});
