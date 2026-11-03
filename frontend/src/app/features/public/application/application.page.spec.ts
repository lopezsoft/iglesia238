import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../core/errors/domain-error';
import { ApplicationPage } from './application.page';
import {
  ApplicationStatusCheck,
  ApplicationSubmission,
  CurrentPrivacyPolicy,
  MunicipalityOption,
  OpenCongregation,
  PublicCatalogs,
  SubmissionReceipt,
  todayIso,
} from './data/public-application.models';
import { PublicApplicationRepository } from './data/public-application.repository';

class FakeRepository extends PublicApplicationRepository {
  readonly submissions: ApplicationSubmission[] = [];
  submitResult: Observable<SubmissionReceipt> = of({ trackingCode: 'IG-7F3K-92QD' });
  policyLoads = 0;

  listOpenCongregations(): Observable<OpenCongregation[]> {
    return of([
      {
        id: 10,
        denominationId: 1,
        denominationName: 'Iglesia Monte de Sion',
        name: 'Sede Central',
        municipalityCode: '13001',
        municipalityName: 'Cartagena',
        regionName: 'Bolívar',
        neighborhood: null,
        address: 'Calle 1',
      },
    ]);
  }
  getCurrentPolicy(denominationId: number): Observable<CurrentPrivacyPolicy> {
    this.policyLoads++;
    return of({
      id: 5,
      denominationId,
      version: '1.0',
      content: 'Tratamos tus datos conforme a la Ley 1581.',
      effectiveFrom: '2026-01-01',
    });
  }
  getCatalogs(): Observable<PublicCatalogs> {
    return of({
      documentTypes: [
        { code: 'CC', name: 'Cédula de ciudadanía' },
        { code: 'TI', name: 'Tarjeta de identidad' },
      ],
      maritalStatuses: [{ code: 'SINGLE', name: 'Soltero(a)' }],
    });
  }
  searchMunicipalities(): Observable<MunicipalityOption[]> {
    return of([{ code: '13001', name: 'Cartagena', regionName: 'Bolívar' }]);
  }
  submit(input: ApplicationSubmission): Observable<SubmissionReceipt> {
    this.submissions.push(input);
    return this.submitResult;
  }
  checkStatus(): Observable<ApplicationStatusCheck> {
    throw new Error('not used');
  }
}

async function render() {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: PublicApplicationRepository, useClass: FakeRepository }],
  });
  const fixture = TestBed.createComponent(ApplicationPage);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const repository = TestBed.inject(PublicApplicationRepository) as FakeRepository;

  const field = <T extends HTMLElement>(selector: string): T => {
    const found = element.querySelector<T>(selector);
    if (!found) {
      throw new Error(`Missing ${selector}`);
    }
    return found;
  };
  const fill = (selector: string, value: string) => {
    const control = field<HTMLInputElement | HTMLSelectElement>(selector);
    control.value = value;
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? 'change' : 'input'));
  };
  const next = async () => {
    field<HTMLFormElement>('form').dispatchEvent(new Event('submit'));
    await fixture.whenStable();
  };
  const pickMunicipality = async () => {
    fill('#municipality-search', 'car');
    await new Promise((resolve) => setTimeout(resolve, 320));
    await fixture.whenStable();
    field('[role="option"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await fixture.whenStable();
  };
  const choosePersonalData = async (birthDate: string) => {
    fill('#firstName', ' Ana ');
    fill('#lastName', 'Pérez');
    fill('#documentNumber', '1023456789');
    fill('#birthDate', birthDate);
    fill('#sex', 'FEMALE');
    fill('#maritalStatusCode', 'SINGLE');
    fill('#phone', '3001234567');
    fill('#address', 'Calle 1 # 2-3');
    fill('#occupation', 'Docente');
    fill('#baptism', 'yes');
    await pickMunicipality();
  };
  const chooseSede = async () => {
    field<HTMLInputElement>('input[type="radio"]').click();
    await fixture.whenStable();
    await next();
  };
  return { fixture, element, repository, field, fill, next, chooseSede, choosePersonalData };
}

describe('ApplicationPage (public wizard)', () => {
  it('opens on the sedes that receive applications, with no demo copy and no session limit', async () => {
    const { element } = await render();

    expect(element.querySelector('h1')?.textContent).toContain('Solicitud de membresía');
    expect(element.textContent).toContain('Sede Central');
    expect(element.textContent).toContain('Cartagena, Bolívar');
    expect(element.textContent).not.toMatch(/demostración|modo demo|por sesión/i);
  });

  it('refuses to continue without a sede', async () => {
    const { element, next } = await render();

    await next();

    expect(element.textContent).toContain('Selecciona una sede para continuar.');
  });

  it('sends an adult application with the data of the form and no guardian', async () => {
    const { fixture, element, repository, field, next, chooseSede, choosePersonalData } = await render();

    await chooseSede();
    await choosePersonalData('1990-05-20');
    await next();

    // Consent step: the policy of the sede and the summary of what will be sent.
    expect(element.textContent).toContain('versión 1.0');
    expect(element.textContent).toContain('Cartagena (Bolívar)');
    field<HTMLInputElement>('#consent-accepted').click();
    await fixture.whenStable();
    await next();

    expect(repository.submissions).toEqual([
      {
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
        occupation: 'Docente',
        previousCongregationName: null,
        isBaptized: true,
        guardian: null,
        consentAccepted: true,
        website: '',
      },
    ]);
    expect(element.textContent).toContain('IG-7F3K-92QD');
    expect(element.textContent).toContain('Recibimos tu solicitud');
  });

  it('asks a minor for the guardian and sends it with its own document type', async () => {
    const { fixture, element, repository, field, fill, next, chooseSede, choosePersonalData } = await render();
    const tenYearsAgo = `${Number(todayIso().slice(0, 4)) - 10}-01-01`;

    await chooseSede();
    await choosePersonalData(tenYearsAgo);
    await next();

    expect(element.textContent).toContain('Datos del acudiente');
    fill('#guardian-firstName', 'Marta');
    fill('#guardian-lastName', 'Ruiz');
    fill('#guardian-documentNumber', '52345678');
    fill('#guardian-relationship', 'Madre');
    fill('#guardian-phone', '3009999999');
    await next();
    field<HTMLInputElement>('#consent-accepted').click();
    await fixture.whenStable();
    await next();

    expect(repository.submissions[0].guardian).toEqual({
      firstName: 'Marta',
      lastName: 'Ruiz',
      documentTypeCode: 'CC',
      documentNumber: '52345678',
      relationship: 'Madre',
      phone: '3009999999',
    });
  });

  it('does not send the form while the personal data is incomplete', async () => {
    const { element, repository, chooseSede, next } = await render();

    await chooseSede();
    await next();

    expect(element.textContent).toContain('Escribe tus nombres.');
    expect(repository.submissions).toEqual([]);
  });

  it('asks for the consent again when the policy changed while the person was filling the form', async () => {
    const { fixture, element, repository, field, next, chooseSede, choosePersonalData } = await render();
    repository.submitResult = throwError(
      () => new DomainError('POLICY_OUTDATED', 'La política de datos cambió. Léela de nuevo.', 409),
    );

    await chooseSede();
    await choosePersonalData('1990-05-20');
    await next();
    field<HTMLInputElement>('#consent-accepted').click();
    await fixture.whenStable();
    const loadsBefore = repository.policyLoads;
    await next();

    expect(element.textContent).toContain('La política de datos cambió');
    expect(field<HTMLInputElement>('#consent-accepted').checked).toBe(false);
    expect(repository.policyLoads).toBeGreaterThan(loadsBefore);
    expect(fixture.nativeElement.textContent).not.toContain('Recibimos tu solicitud');
  });
});
