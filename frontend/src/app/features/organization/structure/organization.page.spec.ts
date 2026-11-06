import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { Scope, SessionUser } from '../../../core/auth/session.model';
import { CatalogsRepository, MunicipalitySearch } from '../../../core/catalogs/catalogs.repository';
import { DomainError } from '../../../core/errors/domain-error';
import { Country, Municipality, Region } from '../../../core/models/catalogs';
import { CongregationFormDialogComponent } from './components/congregation-form-dialog.component';
import { LegalEntityFormDialogComponent } from './components/legal-entity-form-dialog.component';
import { MunicipalitySelectComponent } from './components/municipality-select.component';
import {
  CongregationFormOptions,
  CongregationInput,
  CongregationRow,
  DistrictInput,
  DistrictRow,
  LegalEntityInput,
  LegalEntityRow,
  OrganizationOverview,
  placeLabel,
} from './data/organization.models';
import { OrganizationRepository } from './data/organization.repository';
import { OrganizationPage } from './organization.page';

const denomination: Scope = {
  kind: 'DENOMINATION',
  denominationId: 1,
  congregationId: null,
  label: 'Toda la denominación',
};
const session: SessionUser = {
  id: 1,
  displayName: 'Andrés Molina',
  email: 'andres@iglesia.example',
  emailVerified: true,
  assignments: [
    {
      role: 'DENOMINATION_ADMIN',
      roleName: 'Administrador de denominación',
      permissions: ['congregations.manage', 'users.manage'],
      scope: denomination,
    },
  ],
  selectableScopes: [denomination],
};

class FakeAuthGateway extends AuthGateway {
  login(): Observable<SessionUser> {
    return of(session);
  }
  restore(): Observable<SessionUser | null> {
    return of(session);
  }
  logout(): Observable<void> {
    return of(undefined);
  }
  requestPasswordReset(): Observable<void> {
    return of(undefined);
  }
  confirmPasswordReset(): Observable<void> {
    return of(undefined);
  }
  getInvitation(): Observable<InvitationInfo> {
    return of({ email: 'x@y.z', displayName: null, expiresAt: null });
  }
  acceptInvitation(): Observable<void> {
    return of(undefined);
  }
  confirmEmail = () => of(undefined);
  resendEmailVerification = () => of({ devVerificationLink: null });
  changePassword(): Observable<void> {
    return of(undefined);
  }
}

const SEDE: CongregationRow = {
  id: 10,
  denominationId: 1,
  legalEntityId: 3,
  legalEntityName: 'Corporación Monte de Sión',
  districtId: 2,
  districtNumber: '2',
  code: 'SC',
  name: 'Sede Central',
  municipalityCode: '13001',
  municipalityName: 'Cartagena de Indias',
  regionCode: '13',
  regionName: 'Bolívar',
  neighborhood: 'Centro',
  address: 'Calle 30 # 7-45',
  phone: null,
  email: null,
  acceptsApplications: true,
  isActive: true,
  createdAt: '2026-10-01T15:00:00.000Z',
};
const ENTITY: LegalEntityRow = {
  id: 3,
  denominationId: 1,
  legalName: 'Corporación Monte de Sión',
  tradeName: null,
  taxId: '900.123.456-7',
  legalRepresentative: 'Representante',
  email: null,
  phone: null,
  address: null,
  countryId: 1,
  countryName: 'Colombia',
  municipalityCode: '13001',
  municipalityName: 'Cartagena de Indias',
  regionCode: '13',
  regionName: 'Bolívar',
  isActive: true,
  createdAt: '2026-10-01T15:00:00.000Z',
};
/** Legal entities of the sede form: two of Colombia and one of a test country without municipalities. */
const FORM_OPTIONS: CongregationFormOptions = {
  legalEntities: [
    { id: 3, label: 'Corporación Monte de Sión', isActive: true, countryId: 1, countryName: 'Colombia' },
    { id: 5, label: 'Fundación Sión Norte', isActive: true, countryId: 1, countryName: 'Colombia' },
    { id: 4, label: 'Asociación de prueba', isActive: true, countryId: 2, countryName: 'País de prueba' },
  ],
  districts: [],
};
const OVERVIEW: OrganizationOverview = {
  denominationName: 'Monte de Sión',
  activeCongregations: 1,
  totalCongregations: 1,
  acceptingApplications: 1,
  legalEntities: 1,
  districts: 1,
};

class FakeOrganizationRepository extends OrganizationRepository {
  overview(): Observable<OrganizationOverview> {
    return of(OVERVIEW);
  }
  hasPolicyInForce(): Observable<boolean> {
    return of(this.policyInForce);
  }
  policyInForce = true;
  formOptions: CongregationFormOptions = { legalEntities: [], districts: [] };
  readonly created: CongregationInput[] = [];
  readonly createdLegalEntities: LegalEntityInput[] = [];
  listCongregations(): Observable<CongregationRow[]> {
    return of([SEDE]);
  }
  congregationFormOptions(): Observable<CongregationFormOptions> {
    return of(this.formOptions);
  }
  createCongregation(input: CongregationInput): Observable<CongregationRow> {
    this.created.push(input);
    return of(SEDE);
  }
  updateCongregation(): Observable<CongregationRow> {
    return of(SEDE);
  }
  setCongregationActive(): Observable<CongregationRow> {
    return of(SEDE);
  }
  setAcceptsApplications(): Observable<CongregationRow> {
    return of(SEDE);
  }
  listLegalEntities(): Observable<LegalEntityRow[]> {
    return of([ENTITY]);
  }
  createLegalEntity(input: LegalEntityInput): Observable<LegalEntityRow> {
    this.createdLegalEntities.push(input);
    return of(ENTITY);
  }
  updateLegalEntity(): Observable<LegalEntityRow> {
    return of(ENTITY);
  }
  setLegalEntityActive(): Observable<LegalEntityRow> {
    return of(ENTITY);
  }
  listDistricts(): Observable<DistrictRow[]> {
    return of([]);
  }
  createDistrict(_input: DistrictInput): Observable<DistrictRow> {
    return of({ id: 1, denominationId: 1, number: '1', name: null, congregationNames: [] });
  }
  updateDistrict(): Observable<DistrictRow> {
    return of({ id: 1, denominationId: 1, number: '1', name: null, congregationNames: [] });
  }
}

const REGIONS: Region[] = [
  { countryId: 1, code: '05', name: 'Antioquia' },
  { countryId: 1, code: '13', name: 'Bolívar' },
];
const MUNICIPALITIES: Municipality[] = [
  { code: '13001', name: 'Cartagena de Indias', regionCode: '13', regionName: 'Bolívar' },
  { code: '13430', name: 'Magangué', regionCode: '13', regionName: 'Bolívar' },
  { code: '05001', name: 'Medellín', regionCode: '05', regionName: 'Antioquia' },
];
const COUNTRIES: Country[] = [{ id: 1, isoAlpha2: 'CO', name: 'Colombia', hasMunicipalities: true }];

class FakeCatalogsRepository extends CatalogsRepository {
  readonly searches: MunicipalitySearch[] = [];

  catalogs() {
    return of({ documentTypes: [], maritalStatuses: [], educationLevels: [], studyTypes: [], meetingTypes: [], attendanceCategories: [] });
  }
  countries() {
    return of(COUNTRIES);
  }
  override regions(countryId: number) {
    return of(REGIONS.filter((region) => region.countryId === countryId));
  }
  searchMunicipalities(query: MunicipalitySearch) {
    this.searches.push(query);
    // Only Colombia (id 1) has municipalities in this fake; an unfiltered search covers it too.
    if (query.countryId !== undefined && query.countryId !== null && query.countryId !== 1) {
      return of([]);
    }
    return of(
      MUNICIPALITIES.filter(
        (item) =>
          (!query.regionCode || item.regionCode === query.regionCode) &&
          item.name.toLowerCase().includes(query.search.toLowerCase()),
      ),
    );
  }
  municipality() {
    return of(MUNICIPALITIES[0]);
  }
}

function configure(catalogs = new FakeCatalogsRepository(), organization = new FakeOrganizationRepository()) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AuthGateway, useClass: FakeAuthGateway },
      { provide: OrganizationRepository, useValue: organization },
      { provide: CatalogsRepository, useValue: catalogs },
    ],
  });
  return catalogs;
}

describe('OrganizationPage', () => {
  it('shows the KPI cards, the sede with its code and the municipality resolved by the API', async () => {
    configure();
    await firstValueFrom(TestBed.inject(AuthService).login('andres@iglesia.example', 'x'));
    const fixture = TestBed.createComponent(OrganizationPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const cards = Array.from(element.querySelectorAll('app-stat-card')).map((card) => card.textContent ?? '');
    expect(cards.some((text) => text.includes('Aceptan inscripciones') && text.includes('1 de 1'))).toBe(true);
    const row = element.querySelector('app-congregations-panel tbody tr');
    expect(row?.textContent).toContain('Sede Central');
    expect(row?.textContent).toContain('SC');
    expect(row?.textContent).toContain('Cartagena de Indias (Bolívar)');
    expect(row?.textContent).toContain('Distrito 2');
  });

  it('warns that the public form shows no sede while the denomination has no policy in force', async () => {
    const organization = new FakeOrganizationRepository();
    organization.policyInForce = false;
    configure(undefined, organization);
    await firstValueFrom(TestBed.inject(AuthService).login('andres@iglesia.example', 'x'));
    const fixture = TestBed.createComponent(OrganizationPage);
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const warning = element.querySelector('app-congregations-panel .alert--warning');
    expect(warning?.textContent).toContain('no tiene una política de datos publicada');
    expect(warning?.querySelector('a[href="/privacy-policy"]')).not.toBeNull();
  });

  it('does not warn when a policy is in force', async () => {
    configure();
    await firstValueFrom(TestBed.inject(AuthService).login('andres@iglesia.example', 'x'));
    const fixture = TestBed.createComponent(OrganizationPage);
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('app-congregations-panel .alert--warning')).toBeNull();
  });

  it('switches to the legal entities tab', async () => {
    configure();
    await firstValueFrom(TestBed.inject(AuthService).login('andres@iglesia.example', 'x'));
    const fixture = TestBed.createComponent(OrganizationPage);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    fixture.componentRef.setInput('tab', 'razones');
    await fixture.whenStable();

    expect(element.querySelector('app-legal-entities-panel')?.textContent).toContain('900.123.456-7');
    expect(element.querySelector('app-legal-entities-panel tbody tr')?.textContent).toContain('Colombia');
    expect(element.querySelector('app-congregations-panel')).toBeNull();
  });
});

describe('MunicipalitySelectComponent', () => {
  it('searches the real catalog after a pause in typing and emits the code with its label', async () => {
    const catalogs = configure();
    const fixture = TestBed.createComponent(MunicipalitySelectComponent);
    const picked: unknown[] = [];
    fixture.componentInstance.picked.subscribe((value) => picked.push(value));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const input = element.querySelector<HTMLInputElement>('input[role="combobox"]');
    input!.value = 'cart';
    input!.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();

    expect(catalogs.searches.at(-1)).toEqual({ search: 'cart', limit: 15 });
    const option = element.querySelector<HTMLElement>('[role="option"]');
    expect(option?.textContent).toContain('Cartagena de Indias');
    option?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    expect(picked).toEqual([{ code: '13001', label: 'Cartagena de Indias (Bolívar)' }]);
  });

  it('does not search with fewer than two letters', async () => {
    const catalogs = configure();
    const fixture = TestBed.createComponent(MunicipalitySelectComponent);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    const input = element.querySelector<HTMLInputElement>('input[role="combobox"]');
    input!.value = 'c';
    input!.dispatchEvent(new Event('input'));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();

    expect(catalogs.searches).toHaveLength(0);
  });

  it('shows the chosen municipality and lets the person change it', async () => {
    configure();
    const fixture = TestBed.createComponent(MunicipalitySelectComponent);
    fixture.componentRef.setInput('code', '13001');
    fixture.componentRef.setInput('label', 'Cartagena de Indias (Bolívar)');
    const cleared: boolean[] = [];
    fixture.componentInstance.cleared.subscribe(() => cleared.push(true));
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(element.querySelector('.picked__label')?.textContent).toContain('Cartagena de Indias (Bolívar)');
    element.querySelector<HTMLButtonElement>('.picked .btn')?.click();
    expect(cleared).toEqual([true]);
  });
});

describe('LegalEntityFormDialogComponent', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('focuses the first input on open, links country -> region -> municipality and focuses the municipality input when a region is chosen', async () => {
    const organization = new FakeOrganizationRepository();
    const catalogs = configure(undefined, organization);
    const fixture = TestBed.createComponent(LegalEntityFormDialogComponent);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;

    const nameInput = element.querySelector<HTMLInputElement>('#legal-entity-name')!;
    expect(document.activeElement).toBe(nameInput);

    const regionSelect = element.querySelector<HTMLSelectElement>('#legal-entity-region')!;
    expect(Array.from(regionSelect.options).map((option) => option.textContent?.trim())).toEqual([
      'Selecciona el departamento o estado',
      'Antioquia',
      'Bolívar',
    ]);

    regionSelect.value = '05';
    regionSelect.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    const municipalityInput = element.querySelector<HTMLInputElement>('#legal-entity-municipality')!;
    expect(document.activeElement).toBe(municipalityInput);
    expect(catalogs.searches.at(-1)).toEqual({
      search: '',
      limit: 15,
      countryId: 1,
      regionCode: '05',
    });

    const option = element.querySelector<HTMLElement>('[role="option"]')!;
    expect(option.textContent).toContain('Medellín');
    option.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();

    expect(element.querySelector('.picked__label')?.textContent).toContain('Medellín (Antioquia)');
    document.body.removeChild(fixture.nativeElement);
  });
});

describe('CongregationFormDialogComponent', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  interface FormInternals {
    form: {
      patchValue(value: Record<string, unknown>): void;
      controls: { municipalityCode: { value: string } };
    };
    submit(): void;
  }

  async function renderForm() {
    const organization = new FakeOrganizationRepository();
    organization.formOptions = FORM_OPTIONS;
    const catalogs = configure(undefined, organization);
    const fixture = TestBed.createComponent(CongregationFormDialogComponent);
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      element,
      catalogs,
      organization,
      component: fixture.componentInstance as unknown as FormInternals,
      async chooseLegalEntity(id: string): Promise<void> {
        const select = element.querySelector<HTMLSelectElement>('#congregation-legal-entity')!;
        select.value = id;
        select.dispatchEvent(new Event('change'));
        await fixture.whenStable();
        fixture.detectChanges();
      },
      async typeMunicipality(text: string): Promise<void> {
        const input = element.querySelector<HTMLInputElement>('#congregation-municipality')!;
        input.value = text;
        input.dispatchEvent(new Event('input'));
        await new Promise((resolve) => setTimeout(resolve, 320));
        await fixture.whenStable();
        fixture.detectChanges();
      },
    };
  }

  it('requires the municipality and asks for the legal entity before searching it', async () => {
    const { element, fixture, component, organization } = await renderForm();

    expect(element.querySelector('#congregation-municipality')?.hasAttribute('disabled')).toBe(true);
    expect(element.textContent).toContain('Elige primero la razón social.');

    component.form.patchValue({ name: 'Sede Chía', legalEntityId: '3', address: 'Calle 1' });
    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(organization.created).toEqual([]);
    expect(element.textContent).toContain('Selecciona el municipio.');
  });

  it('searches only in the country of the legal entity and forgets the municipality of another country', async () => {
    const { element, fixture, catalogs, component, chooseLegalEntity, typeMunicipality } = await renderForm();
    component.form.patchValue({ name: 'Sede Centro', address: 'Calle 30' });

    await chooseLegalEntity('3');
    expect(element.textContent).toContain('Municipios de Colombia, el país de la razón social.');
    await typeMunicipality('cart');

    expect(catalogs.searches.at(-1)).toEqual({ search: 'cart', limit: 15, countryId: 1 });
    element.querySelector('[role="option"]')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(component.form.controls.municipalityCode.value).toBe('13001');

    // Another legal entity of the same country keeps the municipality.
    await chooseLegalEntity('5');
    expect(component.form.controls.municipalityCode.value).toBe('13001');

    // A legal entity of another country forgets it, and that country has no municipality to choose.
    await chooseLegalEntity('4');
    expect(component.form.controls.municipalityCode.value).toBe('');
    expect(element.textContent).toContain('No hay municipios cargados para este país.');
    const alerts = Array.from(element.querySelectorAll('[role="alert"]')).map((alert) => alert.textContent ?? '');
    expect(alerts.some((text) => text.includes('no tiene municipios cargados'))).toBe(true);
  });

  it('sends the municipality of the legal entity country and shows a mismatch on the field', async () => {
    const { element, fixture, component, organization } = await renderForm();
    organization.createCongregation = (input: CongregationInput) => {
      organization.created.push(input);
      return throwError(
        () => new DomainError('MUNICIPALITY_COUNTRY_MISMATCH', 'El municipio no pertenece al país de la razón social.', 400),
      );
    };
    component.form.patchValue({ name: 'Sede Centro', legalEntityId: '3', municipalityCode: '13001', address: 'Calle 30' });

    component.submit();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(organization.created).toEqual([expect.objectContaining({ legalEntityId: 3, municipalityCode: '13001' })]);
    const alerts = Array.from(element.querySelectorAll('[role="alert"]')).map((alert) => alert.textContent ?? '');
    expect(alerts.some((text) => text.includes('El municipio no pertenece al país de la razón social.'))).toBe(true);
    expect(element.querySelector('.alert--danger')).toBeNull();
  });
});

describe('placeLabel', () => {
  it('joins the municipality and its department', () => {
    expect(placeLabel({ municipalityName: 'Magangué', regionName: 'Bolívar' })).toBe('Magangué (Bolívar)');
    expect(placeLabel({ municipalityName: 'Bogotá, D.C.', regionName: null })).toBe('Bogotá, D.C.');
    expect(placeLabel({ municipalityName: null, regionName: null })).toBe('—');
  });
});
