import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CongregationRegistration, PublicLegalEntity } from './congregation-registration.models';
import { CongregationRegistrationRepository } from './congregation-registration.repository';
import { HttpCongregationRegistrationRepository } from './http-congregation-registration.repository';

const ENTITY: PublicLegalEntity = {
  id: 4,
  legalName: 'Corporación Iglesia Monte de Sión',
  tradeName: null,
  taxIdMasked: '900.***.**6-7',
  denominationId: 2,
  denominationName: 'Iglesia Cristiana Monte de Sión',
  countryId: 1,
  countryName: 'Colombia',
};

const REGISTRATION: CongregationRegistration = {
  legalEntityId: 4,
  congregation: { name: 'Sede Chía', municipalityCode: '25175', address: 'Calle 1 # 2-3' },
  manager: { displayName: 'Ana Pérez', email: 'ana@iglesia.example', password: 'una-clave-larga-1' },
};

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CongregationRegistrationRepository, useClass: HttpCongregationRegistrationRepository },
    ],
  });
  return {
    repository: TestBed.inject(CongregationRegistrationRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpCongregationRegistrationRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists the public legal entities without any scope header', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.listLegalEntities());
    const request = backend.expectOne('/api/public/legal-entities');
    expect(request.request.method).toBe('GET');
    request.flush([ENTITY]);

    expect(await result).toEqual([ENTITY]);
  });

  it('posts the registration with the agreed body and maps the receipt', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.register(REGISTRATION));
    const request = backend.expectOne('/api/public/congregation-registrations');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(REGISTRATION);
    request.flush(
      { emailVerificationRequired: true, congregationName: 'Sede Chía', devVerificationLink: 'http://localhost:4200/login/verify-email?token=t' },
      { status: 201, statusText: 'Created' },
    );

    expect(await result).toEqual({
      emailVerificationRequired: true,
      congregationName: 'Sede Chía',
      devVerificationLink: 'http://localhost:4200/login/verify-email?token=t',
    });
  });

  it('has no dev link when the server sent the e-mail', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.register(REGISTRATION));
    backend
      .expectOne('/api/public/congregation-registrations')
      .flush({ emailVerificationRequired: true, congregationName: 'Sede Chía' }, { status: 201, statusText: 'Created' });

    expect((await result).devVerificationLink).toBeNull();
  });
});
