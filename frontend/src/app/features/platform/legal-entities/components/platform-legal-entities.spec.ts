import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { Scope } from '../../../../core/auth/session.model';
import { SCRIPTED_PASSWORD, ScriptedAuthGateway } from '../../../../core/auth/testing/scripted-auth.gateway';
import { sessionOf } from '../../../../core/auth/testing/scripted-sessions';
import { CatalogsRepository, MunicipalitySearch } from '../../../../core/catalogs/catalogs.repository';
import { DomainError } from '../../../../core/errors/domain-error';
import { Country, Municipality } from '../../../../core/models/catalogs';
import { DenominationsPage } from '../../denominations/denominations.page';
import { DenominationsRepository } from '../../denominations/data/denominations.repository';
import { DenominationSummary } from '../../denominations/data/denominations.models';
import {
  PlatformLegalEntityCreate,
  PlatformLegalEntityInput,
  PlatformLegalEntityRow,
} from '../data/platform-legal-entities.models';
import { PlatformLegalEntitiesRepository } from '../data/platform-legal-entities.repository';
import { PlatformCountriesRepository } from '../../countries/data/platform-countries.repository';
import { PlatformLegalEntityFormDialogComponent } from './platform-legal-entity-form-dialog.component';

const PLATFORM: Scope = { kind: 'PLATFORM', denominationId: null, congregationId: null, label: 'Plataforma' };

const SION: DenominationSummary = {
  id: 2,
  name: 'Iglesia Cristiana Monte de Sión',
  isActive: true,
  createdAt: '2026-10-01T15:00:00.000Z',
  legalEntityCount: 1,
  congregationCount: 2,
};
const VIDA: DenominationSummary = { ...SION, id: 3, name: 'Vida Nueva', legalEntityCount: 0, congregationCount: 0 };

const ROW: PlatformLegalEntityRow = {
  id: 7,
  denominationId: 2,
  denominationName: SION.name,
  legalName: 'Corporación Iglesia Monte de Sión',
  tradeName: 'Monte de Sión',
  taxId: '900.123.456-7',
  legalRepresentative: 'Ana Pérez',
  email: null,
  phone: null,
  address: null,
  countryId: 1,
  countryName: 'Colombia',
  municipalityCode: '25175',
  municipalityName: 'Chía',
  regionName: 'Cundinamarca',
  isActive: true,
  congregationCount: 2,
};

class FakePlatformLegalEntitiesRepository extends PlatformLegalEntitiesRepository {
  readonly listed: (number | null)[] = [];
  readonly created: PlatformLegalEntityCreate[] = [];
  readonly toggled: { id: number; isActive: boolean }[] = [];
  createError: DomainError | null = null;
  updateError: DomainError | null = null;

  list(denominationId: number | null): Observable<PlatformLegalEntityRow[]> {
    this.listed.push(denominationId);
    return of([ROW]);
  }
  create(input: PlatformLegalEntityCreate): Observable<PlatformLegalEntityRow> {
    this.created.push(input);
    return this.createError ? throwError(() => this.createError) : of({ ...ROW, ...input, id: 8, denominationName: SION.name });
  }
  update(id: number, input: PlatformLegalEntityInput): Observable<PlatformLegalEntityRow> {
    return this.updateError ? throwError(() => this.updateError) : of({ ...ROW, ...input, id });
  }
  setActive(id: number, isActive: boolean): Observable<PlatformLegalEntityRow> {
    this.toggled.push({ id, isActive });
    return of({ ...ROW, id, isActive });
  }
}

const denominationsRepository = {
  list: () => of({ items: [VIDA, SION], total: 2, page: 1, pageSize: 100 }),
  stats: () => of({ total: 2, active: 2, congregations: 2 }),
};

const COLOMBIA: Country = { id: 1, isoAlpha2: 'CO', name: 'Colombia', hasMunicipalities: true };
/** A country registered without municipalities (fixture only, no real data). */
const EMPTY_COUNTRY: Country = { id: 2, isoAlpha2: 'XX', name: 'País de prueba', hasMunicipalities: false };
/** Deactivated by the platform: the API no longer lists it (it is only here to prove the filter). */
const INACTIVE_COUNTRY: Country = { id: 3, isoAlpha2: 'YY', name: 'País inactivo', hasMunicipalities: true, isActive: false };
const CHIA: Municipality = { code: '25175', name: 'Chía', regionCode: '25', regionName: 'Cundinamarca', countryId: 1 };

class FakeCatalogs {
  readonly searches: MunicipalitySearch[] = [];
  catalogs = () => of({});
  countries = () => of([EMPTY_COUNTRY, INACTIVE_COUNTRY, COLOMBIA]);
  searchMunicipalities = (query: MunicipalitySearch) => {
    this.searches.push(query);
    return of(query.countryId === COLOMBIA.id ? [CHIA] : []);
  };
  municipality = () => of(undefined);
}
let catalogsRepository = new FakeCatalogs();

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

async function setup() {
  sessionStorage.clear();
  catalogsRepository = new FakeCatalogs();
  const repository = new FakePlatformLegalEntitiesRepository();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      {
        provide: AuthGateway,
        useValue: new ScriptedAuthGateway([
          sessionOf(
            'plataforma@iglesia.example',
            'Equipo de plataforma',
            [
              {
                role: 'PLATFORM_ADMIN',
                roleName: 'Administrador de plataforma',
                permissions: ['denominations.manage'],
                scope: PLATFORM,
              },
            ],
            [PLATFORM],
          ),
        ]),
      },
      { provide: DenominationsRepository, useValue: denominationsRepository },
      { provide: PlatformLegalEntitiesRepository, useValue: repository },
      {
        provide: PlatformCountriesRepository,
        useValue: {
          list: () =>
            of([{ ...COLOMBIA, isActive: true, regionCount: 33, municipalityCount: 1122 }]),
          setActive: () => of(undefined),
        },
      },
      { provide: CatalogsRepository, useValue: catalogsRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('plataforma@iglesia.example', SCRIPTED_PASSWORD));
  return repository;
}

describe('Razones sociales section of the platform', () => {
  async function renderPage(repository: FakePlatformLegalEntitiesRepository) {
    const fixture = TestBed.createComponent(DenominationsPage);
    fixture.componentRef.setInput('tab', 'razones');
    await fixture.whenStable();
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement, repository };
  }

  it('lists the legal entities of every church with their NIT and sedes', async () => {
    const { element, repository } = await renderPage(await setup());

    const row = element.querySelector('app-platform-legal-entities-panel tbody tr');
    expect(row?.textContent).toContain('Corporación Iglesia Monte de Sión');
    expect(row?.textContent).toContain(SION.name);
    expect(row?.textContent).toContain('900.123.456-7');
    expect(row?.textContent).toContain('Chía (Cundinamarca)');
    expect(row?.textContent).toContain('Colombia');
    const headers = Array.from(element.querySelectorAll('app-platform-legal-entities-panel th')).map((th) =>
      th.textContent?.trim(),
    );
    expect(headers).toContain('País');
    expect(repository.listed).toEqual([null]);
    expect(element.textContent).toContain('Nueva razón social');
  });

  it('keeps the denominations list as the default section', async () => {
    await setup();
    const fixture = TestBed.createComponent(DenominationsPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('app-platform-legal-entities-panel')).toBeNull();
    expect(element.textContent).toContain('Nueva denominación');
    expect(Array.from(element.querySelectorAll('[role="tab"]')).map((tab) => tab.textContent)).toEqual([
      expect.stringContaining('Denominaciones'),
      expect.stringContaining('Razones sociales'),
      expect.stringContaining('Países'),
    ]);
  });

  it('shows the countries section without a create button', async () => {
    await setup();
    const fixture = TestBed.createComponent(DenominationsPage);
    fixture.componentRef.setInput('tab', 'paises');
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('app-platform-countries-panel tbody tr')?.textContent).toContain('Colombia');
    expect(element.querySelector('app-page-header .btn--primary')).toBeNull();
  });

  it('filters by denomination', async () => {
    const { element, fixture, repository } = await renderPage(await setup());

    const select = element.querySelector<HTMLSelectElement>('#legal-entity-denomination-filter')!;
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Todas las denominaciones',
      SION.name,
      'Vida Nueva',
    ]);
    select.value = '3';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(repository.listed).toEqual([null, 3]);
  });

  it('asks for confirmation before deactivating and then calls the API', async () => {
    const { element, fixture, repository } = await renderPage(await setup());

    element.querySelector<HTMLButtonElement>('[aria-label="Desactivar Corporación Iglesia Monte de Sión"]')!.click();
    await fixture.whenStable();
    fixture.detectChanges();

    const dialog = element.querySelector('app-confirm-dialog')!;
    expect(dialog.textContent).toContain('¿Desactivar la razón social?');
    expect(repository.toggled).toEqual([]);

    Array.from(dialog.querySelectorAll<HTMLButtonElement>('button'))
      .find((button) => button.textContent?.trim() === 'Desactivar')!
      .click();
    await fixture.whenStable();

    expect(repository.toggled).toEqual([{ id: 7, isActive: false }]);
    expect(element.textContent).toContain('Razón social «Corporación Iglesia Monte de Sión» desactivada.');
  });
});

describe('PlatformLegalEntityFormDialogComponent', () => {
  async function render(row: PlatformLegalEntityRow | null = null) {
    const repository = await setup();
    const fixture = TestBed.createComponent(PlatformLegalEntityFormDialogComponent);
    fixture.componentRef.setInput('legalEntity', row);
    fixture.componentRef.setInput('denominations', [
      { id: 2, name: SION.name, isActive: true },
      { id: 3, name: 'Vida Nueva', isActive: true },
    ]);
    fixture.componentRef.setInput('defaultDenominationId', 2);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    const component = fixture.componentInstance as unknown as {
      form: {
        patchValue(value: Record<string, unknown>): void;
        getRawValue(): Record<string, unknown>;
        controls: { denominationId: { disabled: boolean }; municipalityCode: { value: string } };
      };
      submit(): void;
    };
    return { fixture, element: fixture.nativeElement as HTMLElement, component, repository };
  }

  it('does not send an incomplete form', async () => {
    const { component, repository, fixture } = await render();

    component.submit();
    await fixture.whenStable();

    expect(repository.created).toEqual([]);
  });

  it('creates under the chosen church with the trimmed fields', async () => {
    const { component, repository, fixture } = await render();
    const saved = vi.fn();
    fixture.componentInstance.saved.subscribe(saved);
    component.form.patchValue({
      denominationId: 3,
      legalName: '  Corporación Vida Nueva ',
      taxId: '800.555.444-1',
      legalRepresentative: 'Luis Gómez',
      municipalityCode: '25175',
    });

    component.submit();
    await fixture.whenStable();

    expect(repository.created).toEqual([
      {
        denominationId: 3,
        legalName: 'Corporación Vida Nueva',
        tradeName: null,
        taxId: '800.555.444-1',
        legalRepresentative: 'Luis Gómez',
        countryId: 1,
        municipalityCode: '25175',
        email: null,
        phone: null,
        address: null,
      },
    ]);
    expect(saved).toHaveBeenCalledWith(expect.objectContaining({ created: true }));
  });

  it('shows the duplicate NIT conflict next to the NIT field', async () => {
    const { component, repository, element, fixture } = await render();
    repository.createError = new DomainError('DUPLICATE_TAX_ID', 'Ya existe una razón social con ese NIT.', 409);
    component.form.patchValue({
      denominationId: 2,
      legalName: 'Otra',
      taxId: '900.123.456-7',
      legalRepresentative: 'Ana',
      municipalityCode: '25175',
    });

    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('#platform-le-tax-id-error')?.textContent).toContain('Ya existe una razón social con ese NIT.');
  });

  it('locks the church when editing', async () => {
    const { component } = await render(ROW);

    expect(component.form.controls.denominationId.disabled).toBe(true);
  });

  it('preselects the default country and lists only the country names', async () => {
    const { element, component } = await render();

    const select = element.querySelector<HTMLSelectElement>('#platform-le-country')!;
    expect(element.querySelector('label[for="platform-le-country"]')?.textContent).toContain('País *');
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Selecciona el país',
      'Colombia',
      'País de prueba',
    ]);
    expect(component.form.getRawValue()['countryId']).toBe(1);
    expect(select.selectedOptions[0].textContent?.trim()).toBe('Colombia');
  });

  it('searches the municipalities of the chosen country only', async () => {
    const { element, fixture } = await render();

    const input = element.querySelector<HTMLInputElement>('#platform-le-municipality')!;
    input.value = 'chí';
    input.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 320));
    await fixture.whenStable();

    expect(catalogsRepository.searches.at(-1)).toEqual({ search: 'chí', limit: 15, countryId: 1 });
    expect(element.querySelector('[role="option"]')?.textContent).toContain('Chía');
  });

  it('forgets the municipality when the country changes and explains a country without municipalities', async () => {
    const { element, fixture, component, repository } = await render();
    component.form.patchValue({
      denominationId: 3,
      legalName: 'Corporación Vida Nueva',
      taxId: '800.555.444-1',
      legalRepresentative: 'Luis Gómez',
      municipalityCode: '25175',
    });
    fixture.detectChanges();

    const select = element.querySelector<HTMLSelectElement>('#platform-le-country')!;
    select.selectedIndex = 2;
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.form.getRawValue()['countryId']).toBe(2);
    expect(component.form.controls.municipalityCode.value).toBe('');
    expect(element.querySelector('#platform-le-municipality')?.hasAttribute('disabled')).toBe(true);
    expect(element.textContent).toContain('No hay municipios cargados para este país.');
    expect(element.querySelector('label[for="platform-le-municipality"]')?.textContent?.trim()).toBe('Municipio');

    component.submit();
    await fixture.whenStable();

    expect(repository.created).toEqual([expect.objectContaining({ countryId: 2, municipalityCode: null })]);
  });

  it('keeps the inactive country of an edited legal entity visible and shows why it cannot be saved', async () => {
    const { element, fixture, component, repository } = await render({
      ...ROW,
      countryId: 3,
      countryName: 'País inactivo',
    });
    const select = element.querySelector<HTMLSelectElement>('#platform-le-country')!;
    expect(Array.from(select.options).map((option) => option.textContent?.trim())).toEqual([
      'Selecciona el país',
      'Colombia',
      'País de prueba',
      'País inactivo (inactivo)',
    ]);
    expect(select.selectedOptions[0].textContent?.trim()).toBe('País inactivo (inactivo)');
    repository.updateError = new DomainError('COUNTRY_INACTIVE', 'El país no está activo en el sistema.', 409);

    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('#platform-le-country-error')?.textContent).toContain('El país no está activo en el sistema.');
    expect(element.querySelector('#platform-le-tax-id-error')?.textContent?.trim()).toBe('');
  });

  it('shows the municipality mismatch on the field and the sedes conflict in the dialog', async () => {
    const { component, repository, element, fixture } = await render();
    const fill = () =>
      component.form.patchValue({
        denominationId: 2,
        legalName: 'Otra',
        taxId: '900.123.456-7',
        legalRepresentative: 'Ana',
        municipalityCode: '25175',
      });
    fill();
    repository.createError = new DomainError(
      'MUNICIPALITY_COUNTRY_MISMATCH',
      'El municipio no pertenece al país de la razón social.',
      400,
    );

    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('#platform-le-municipality-error')?.textContent).toContain(
      'El municipio no pertenece al país de la razón social.',
    );

    repository.createError = new DomainError(
      'LEGAL_ENTITY_HAS_CONGREGATIONS',
      'La razón social tiene sedes: no se puede cambiar su país.',
      409,
    );
    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('.alert--danger[role="alert"]')?.textContent).toContain(
      'La razón social tiene sedes: no se puede cambiar su país.',
    );
    expect(element.querySelector('#platform-le-tax-id-error')?.textContent?.trim()).toBe('');
  });
});
