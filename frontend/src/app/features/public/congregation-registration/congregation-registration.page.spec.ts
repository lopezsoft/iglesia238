import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../core/errors/domain-error';
import { MunicipalityFilter, MunicipalityOption } from '../application/data/public-application.models';
import { PublicApplicationRepository } from '../application/data/public-application.repository';
import { CongregationRegistrationPage } from './congregation-registration.page';
import {
  CongregationRegistration,
  PublicLegalEntity,
  RegistrationReceipt,
  groupLegalEntities,
} from './data/congregation-registration.models';
import { CongregationRegistrationRepository } from './data/congregation-registration.repository';

const SION_A: PublicLegalEntity = {
  id: 4,
  legalName: 'Corporación Iglesia Monte de Sión',
  tradeName: 'Monte de Sión',
  taxIdMasked: '900.***.**6-7',
  denominationId: 2,
  denominationName: 'Iglesia Cristiana Monte de Sión',
  countryId: 1,
  countryName: 'Colombia',
};
const SION_B: PublicLegalEntity = { ...SION_A, id: 5, legalName: 'Asociación Sión Norte', tradeName: null, taxIdMasked: '800.***.**1-2' };
const VIDA: PublicLegalEntity = {
  id: 6,
  legalName: 'Fundación Vida Nueva',
  tradeName: null,
  taxIdMasked: '901.***.**3-4',
  denominationId: 3,
  denominationName: 'Vida Nueva',
  // A test country without municipalities.
  countryId: 2,
  countryName: 'País de prueba',
};

class FakeRegistrationRepository extends CongregationRegistrationRepository {
  entities: PublicLegalEntity[] = [SION_A, VIDA, SION_B];
  readonly sent: CongregationRegistration[] = [];
  failWith: DomainError | null = null;
  devLink: string | null = null;

  listLegalEntities(): Observable<PublicLegalEntity[]> {
    return of(this.entities);
  }
  register(input: CongregationRegistration): Observable<RegistrationReceipt> {
    this.sent.push(input);
    if (this.failWith) {
      return throwError(() => this.failWith);
    }
    return of({
      emailVerificationRequired: true,
      congregationName: input.congregation.name,
      devVerificationLink: this.devLink,
    });
  }
}

const CHIA: MunicipalityOption = { code: '25175', name: 'Chía', regionName: 'Cundinamarca' };

/** Public municipality search: only the country with id 1 has municipalities. */
class FakeMunicipalities {
  readonly searches: { text: string; filter?: MunicipalityFilter }[] = [];
  regions: { code: string; name: string }[] = [];
  listRegions = (_countryId: number) => of(this.regions);
  searchMunicipalities = (text: string, filter?: MunicipalityFilter) => {
    this.searches.push({ text, filter });
    return of(filter?.countryId === 1 ? [CHIA] : []);
  };
}

interface PageInternals {
  form: {
    patchValue(value: Record<string, unknown>): void;
    getRawValue(): Record<string, unknown>;
  };
  stepIndex(): number;
}

async function render(repository = new FakeRegistrationRepository()) {
  const municipalities = new FakeMunicipalities();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CongregationRegistrationRepository, useValue: repository },
      { provide: PublicApplicationRepository, useValue: municipalities },
    ],
  });
  const fixture = TestBed.createComponent(CongregationRegistrationPage);
  await fixture.whenStable();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    repository,
    municipalities,
    element,
    page: fixture.componentInstance as unknown as PageInternals,
    /** Presses the primary button of the wizard (Siguiente / Registrar mi sede). */
    async advance(times = 1): Promise<void> {
      for (let i = 0; i < times; i++) {
        element.querySelector<HTMLFormElement>('form')!.dispatchEvent(new Event('submit'));
        await fixture.whenStable();
        fixture.detectChanges();
      }
    },
  };
}

function fillValid(page: PageInternals): void {
  page.form.patchValue({
    legalEntityId: 4,
    congregation: {
      name: ' Sede Chía ',
      municipalityCode: '25175',
      municipalityName: 'Chía (Cundinamarca)',
      address: 'Calle 1 # 2-3',
      phone: '',
      email: '',
    },
    manager: {
      displayName: ' Ana Pérez ',
      email: 'ana@iglesia.example',
      password: 'una-clave-larga-1',
      confirm: 'una-clave-larga-1',
    },
  });
}

describe('CongregationRegistrationPage', () => {
  it('starts on step 1 with the legal entities grouped by church and the masked NIT', async () => {
    const { element, page } = await render();

    expect(page.stepIndex()).toBe(0);
    expect(element.querySelector('.register__counter')?.textContent).toContain('Paso 1 de 3');
    const groups = Array.from(element.querySelectorAll('.group'));
    expect(groups.map((group) => group.querySelector('.group__title')?.textContent?.trim())).toEqual([
      'Iglesia Cristiana Monte de Sión',
      'Vida Nueva',
    ]);
    expect(groups[0].querySelectorAll('input[type="radio"]')).toHaveLength(2);
    expect(groups[0].textContent).toContain('NIT 800.***.**1-2');
    expect(groups[0].textContent).toContain('Corporación Iglesia Monte de Sión');
    expect(element.textContent).not.toContain('900.123');
    // The data of the next steps is not offered yet.
    expect(element.querySelector('#register-municipality')).toBeNull();
    expect(element.textContent).not.toContain('Tu usuario administrador');
  });

  it('filters the list while the person types', async () => {
    const { element, fixture } = await render();

    const search = element.querySelector<HTMLInputElement>('#legal-entity-search')!;
    search.value = 'vida';
    search.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelectorAll('input[type="radio"]')).toHaveLength(1);
    expect(element.querySelector('[role="status"]')?.textContent).toContain('1 razón social encontrada.');
  });

  it('does not leave step 1 until a legal entity is chosen', async () => {
    const { element, advance, page } = await render();

    await advance();

    expect(page.stepIndex()).toBe(0);
    expect(element.querySelector('#legal-entity-error')?.textContent).toContain('Selecciona la razón social');
  });

  it('walks the three steps and asks for the missing data of each one', async () => {
    const { element, advance, page } = await render();
    page.form.patchValue({ legalEntityId: 4 });

    await advance();
    expect(page.stepIndex()).toBe(1);
    expect(element.querySelector('.register__counter')?.textContent).toContain('Paso 2 de 3');

    await advance();
    expect(page.stepIndex()).toBe(1);
    expect(element.textContent).toContain('Escribe el nombre de la sede.');
    expect(element.textContent).toContain('Selecciona el municipio.');

    page.form.patchValue({
      congregation: { name: 'Sede Chía', municipalityCode: '25175', municipalityName: 'Chía', address: 'Calle 1' },
    });
    await advance();
    expect(page.stepIndex()).toBe(2);
    expect(element.textContent).toContain('Sede Chía');

    await advance();
    expect(page.stepIndex()).toBe(2);
    expect(element.textContent).toContain('Escribe tu correo');
  });

  it('goes back keeping what was typed', async () => {
    const { element, fixture, advance, page } = await render();
    page.form.patchValue({ legalEntityId: 4, congregation: { name: 'Sede Chía' } });
    await advance();
    expect(page.stepIndex()).toBe(1);

    element.querySelector<HTMLButtonElement>('.register__nav button[type="button"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(page.stepIndex()).toBe(0);
    expect(page.form.getRawValue()['legalEntityId']).toBe(4);
  });

  it('does not accept passwords that differ', async () => {
    const { element, repository, advance, page } = await render();
    fillValid(page);
    page.form.patchValue({ manager: { confirm: 'otra-clave-larga-2' } });

    await advance(3);

    expect(repository.sent).toEqual([]);
    expect(page.stepIndex()).toBe(2);
    expect(element.textContent).toContain('Las contraseñas no coinciden.');
  });

  it('registers the sede and tells the manager to check the e-mail', async () => {
    const { element, repository, advance, page } = await render();
    fillValid(page);

    await advance(3);

    expect(repository.sent).toEqual([
      {
        legalEntityId: 4,
        congregation: { name: 'Sede Chía', municipalityCode: '25175', address: 'Calle 1 # 2-3', phone: undefined, email: undefined },
        manager: { displayName: 'Ana Pérez', email: 'ana@iglesia.example', password: 'una-clave-larga-1' },
      },
    ]);
    expect(element.querySelector('h2[tabindex="-1"]')?.textContent).toContain('Revisa tu correo para confirmar tu cuenta');
    expect(element.textContent).toContain('ana@iglesia.example');
    expect(element.textContent).toContain('permanece bloqueada hasta que confirmes tu correo');
    expect(element.querySelector('a[href="/login"]')?.textContent).toContain('Ir a iniciar sesión');
    expect(element.querySelector('app-dev-link-box')).toBeNull();
    expect(element.querySelector('form')).toBeNull();
  });

  it('shows the development box only when the server returns the confirmation link', async () => {
    const repository = new FakeRegistrationRepository();
    repository.devLink = 'http://localhost:4200/login/verify-email?token=dev-token';
    const { element, advance, page } = await render(repository);
    fillValid(page);

    await advance(3);

    const box = element.querySelector('app-dev-link-box')!;
    expect(box.textContent).toContain('Modo desarrollo: SMTP no configurado');
    expect(box.querySelector<HTMLInputElement>('input')?.value).toBe('http://localhost:4200/login/verify-email?token=dev-token');
    expect(box.querySelector('a')?.getAttribute('href')).toBe('http://localhost:4200/login/verify-email?token=dev-token');
  });

  it('keeps the form and shows the API message when the registration is refused', async () => {
    const repository = new FakeRegistrationRepository();
    repository.failWith = new DomainError('EMAIL_TAKEN', 'Ese correo ya tiene una cuenta.', 409);
    const { element, advance, page } = await render(repository);
    fillValid(page);

    await advance(3);

    expect(element.querySelector('.register__error')?.getAttribute('role')).toBe('alert');
    expect(element.querySelector('.register__error')?.textContent).toContain('Ese correo ya tiene una cuenta.');
    expect(element.querySelector('form')).not.toBeNull();
  });

  it('searches the municipality only in the country of the chosen legal entity and shows that country', async () => {
    const { element, fixture, advance, page, municipalities } = await render();
    page.form.patchValue({ legalEntityId: 4 });
    await advance();

    expect(element.querySelector('#register-municipality-country')?.textContent?.trim()).toBe('País: Colombia');
    expect(element.querySelector('#register-municipality')?.getAttribute('aria-describedby')).toContain(
      'register-municipality-country',
    );
    const input = element.querySelector<HTMLInputElement>('#register-municipality')!;
    input.value = 'chí';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 320));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(municipalities.searches.at(-1)).toEqual({ text: 'chí', filter: { countryId: 1 } });
    expect(element.querySelector('[role="option"]')?.textContent).toContain('Chía');
  });

  it('filters municipalities by the selected department or state when regions are loaded', async () => {
    const { element, fixture, advance, page, municipalities } = await render();
    municipalities.regions = [{ code: '25', name: 'Cundinamarca' }];
    page.form.patchValue({ legalEntityId: 4 });
    await advance();

    const regionSelect = element.querySelector<HTMLSelectElement>('#register-region')!;
    expect(regionSelect).not.toBeNull();
    const municipalityInput = element.querySelector<HTMLInputElement>('#register-municipality')!;
    expect(municipalityInput.disabled).toBe(true);

    regionSelect.value = '25';
    regionSelect.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(municipalityInput.disabled).toBe(false);
    municipalityInput.value = 'chí';
    municipalityInput.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 320));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(municipalities.searches.at(-1)).toEqual({
      text: 'chí',
      filter: { countryId: 1, regionCode: '25' },
    });
  });

  it('forgets the municipality when the person goes back and picks a legal entity of another country', async () => {
    const { element, fixture, advance, page } = await render();
    page.form.patchValue({
      legalEntityId: 4,
      congregation: { name: 'Sede Chía', municipalityCode: '25175', municipalityName: 'Chía (Cundinamarca)', address: 'Calle 1' },
    });
    const back = async () => {
      element.querySelector<HTMLButtonElement>('.register__nav button[type="button"]')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await advance();
    await back();

    // Same country: the municipality stays.
    page.form.patchValue({ legalEntityId: 5 });
    expect((page.form.getRawValue()['congregation'] as Record<string, unknown>)['municipalityCode']).toBe('25175');

    // Another country: it is forgotten, and that country has no municipality to choose.
    page.form.patchValue({ legalEntityId: 6 });
    expect((page.form.getRawValue()['congregation'] as Record<string, unknown>)['municipalityCode']).toBe('');
    await advance();
    expect(page.stepIndex()).toBe(1);
    expect(element.querySelector('#register-municipality-country')?.textContent).toContain('País de prueba');
    expect(element.textContent).toContain('No hay municipios cargados para este país.');
    expect(element.querySelector('#register-municipality-error')?.textContent).toContain('aún no tiene municipios cargados');

    await advance();
    expect(page.stepIndex()).toBe(1);
  });

  it('takes the person back to the municipality when the API says it is of another country', async () => {
    const repository = new FakeRegistrationRepository();
    repository.failWith = new DomainError(
      'MUNICIPALITY_COUNTRY_MISMATCH',
      'El municipio no pertenece al país de la razón social.',
      400,
    );
    const { element, advance, page } = await render(repository);
    fillValid(page);

    await advance(3);

    expect(page.stepIndex()).toBe(1);
    const error = element.querySelector('#register-municipality-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(error?.textContent).toContain('El municipio no pertenece al país de la razón social.');
    expect(element.querySelector('.register__error')).toBeNull();
  });

  it('does not offer the form while the platform has registered no legal entity', async () => {
    const repository = new FakeRegistrationRepository();
    repository.entities = [];
    const { element } = await render(repository);

    expect(element.textContent).toContain('Tu iglesia aún no está registrada en la plataforma');
    expect(element.querySelector('.register__blocked-steps')).not.toBeNull();
    expect(element.querySelector('form')).toBeNull();
    expect(element.querySelector('input')).toBeNull();
    expect(element.querySelector('app-application-stepper')).toBeNull();
    expect(element.querySelector('a[href="/login"]')?.textContent).toContain('Ir a iniciar sesión');
    expect(Array.from(element.querySelectorAll('button')).some((b) => b.textContent?.includes('Volver a comprobar'))).toBe(true);
  });
});

describe('groupLegalEntities', () => {
  it('groups by church and sorts both levels without caring about accents or case', () => {
    const groups = groupLegalEntities([
      { ...VIDA, legalName: 'zeta' },
      { ...SION_A, denominationName: 'Álamo', denominationId: 9, legalName: 'Beta' },
      { ...VIDA, id: 10, legalName: 'Álfa' },
    ]);

    expect(groups.map((group) => group.denominationName)).toEqual(['Álamo', 'Vida Nueva']);
    expect(groups[1].entities.map((entity) => entity.legalName)).toEqual(['Álfa', 'zeta']);
  });
});
