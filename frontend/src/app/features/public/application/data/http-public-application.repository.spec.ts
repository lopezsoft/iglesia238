import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { ApplicationSubmission } from './public-application.models';
import { HttpPublicApplicationRepository } from './http-public-application.repository';

const submission: ApplicationSubmission = {
  congregationId: 10,
  policyId: 5,
  firstName: 'Ana',
  lastName: 'Pérez',
  secondLastName: null,
  documentTypeCode: 'CC',
  documentNumber: '1023456789',
  birthDate: '1990-05-20',
  sex: 'FEMALE',
  maritalStatusCode: 'SINGLE',
  phone: '3001234567',
  email: null,
  address: 'Calle 1 # 2-3',
  municipalityCode: '13001',
  neighborhood: null,
  occupation: null,
  previousCongregationName: null,
  isBaptized: null,
  guardian: null,
  consentAccepted: true,
  website: '',
};

function setup() {
  TestBed.configureTestingModule({
    providers: [provideHttpClient(), provideHttpClientTesting(), HttpPublicApplicationRepository],
  });
  return {
    repository: TestBed.inject(HttpPublicApplicationRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpPublicApplicationRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the open congregations', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.listOpenCongregations());
    const request = backend.expectOne('/api/public/congregations');
    expect(request.request.method).toBe('GET');
    request.flush([{ id: 10, name: 'Sede Central' }]);

    expect(await result).toEqual([{ id: 10, name: 'Sede Central' }]);
  });

  it('reads the current policy of the denomination', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.getCurrentPolicy(3));
    backend
      .expectOne('/api/public/denominations/3/privacy-policy/current')
      .flush({ id: 5, denominationId: 3, version: '1.0', content: 'Texto', effectiveFrom: '2026-01-01' });

    expect((await result).version).toBe('1.0');
  });

  it('loads the catalogs of the form', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.getCatalogs());
    backend.expectOne('/api/public/catalogs').flush({
      documentTypes: [{ code: 'CC', name: 'Cédula de ciudadanía' }],
      maritalStatuses: [{ code: 'SINGLE', name: 'Soltero(a)' }],
    });

    expect((await result).documentTypes[0].code).toBe('CC');
  });

  it('searches municipalities by text and keeps only what the form needs', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.searchMunicipalities(' carta '));
    const request = backend.expectOne((req) => req.url === '/api/public/geo/municipalities');
    expect(request.request.params.get('search')).toBe('carta');
    expect(request.request.params.get('limit')).toBe('12');
    request.flush([{ code: '13001', name: 'Cartagena', regionCode: '13', regionName: 'Bolívar' }]);

    expect(await result).toEqual([{ code: '13001', name: 'Cartagena', regionName: 'Bolívar' }]);
    expect(request.request.params.has('countryId')).toBe(false);
  });

  it('limits the municipality search to a country when it is given', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.searchMunicipalities('', { limit: 1, countryId: 3 }));
    const request = backend.expectOne((req) => req.url === '/api/public/geo/municipalities');
    expect(request.request.params.has('search')).toBe(false);
    expect(request.request.params.get('limit')).toBe('1');
    expect(request.request.params.get('countryId')).toBe('3');
    request.flush([]);

    expect(await result).toEqual([]);
  });

  it('submits the form as it is, without any denomination', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.submit(submission));
    const request = backend.expectOne('/api/public/membership-applications');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(submission);
    expect(request.request.body).not.toHaveProperty('denominationId');
    request.flush({ trackingCode: 'IG-7F3K-92QD' });

    expect(await result).toEqual({ trackingCode: 'IG-7F3K-92QD' });
  });

  it('sends the tracking code in the body, normalized, never in the URL', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.checkStatus(' ig-7f3k-92qd '));
    const request = backend.expectOne('/api/public/membership-applications/status');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ trackingCode: 'IG-7F3K-92QD' });
    request.flush({
      status: 'REJECTED',
      statusLabel: 'Rechazada',
      submittedOn: '2026-11-01T10:00:00.000Z',
      reviewedOn: '2026-11-02T10:00:00.000Z',
      notice: 'Tu solicitud no fue aprobada.',
    });

    expect((await result).notice).toContain('no fue aprobada');
  });
});
