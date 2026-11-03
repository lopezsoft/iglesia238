import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, firstValueFrom, of } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { Scope, SessionUser } from '../../../core/auth/session.model';
import { CatalogsRepository, MunicipalitySearch } from '../../../core/catalogs/catalogs.repository';
import { Municipality } from '../../../core/models/catalogs';
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
  municipalityCode: '13001',
  municipalityName: 'Cartagena de Indias',
  regionName: 'Bolívar',
  isActive: true,
  createdAt: '2026-10-01T15:00:00.000Z',
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
  listCongregations(): Observable<CongregationRow[]> {
    return of([SEDE]);
  }
  congregationFormOptions(): Observable<CongregationFormOptions> {
    return of({ legalEntities: [], districts: [] });
  }
  createCongregation(_input: CongregationInput): Observable<CongregationRow> {
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
  createLegalEntity(_input: LegalEntityInput): Observable<LegalEntityRow> {
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

const MUNICIPALITIES: Municipality[] = [
  { code: '13001', name: 'Cartagena de Indias', regionCode: '13', regionName: 'Bolívar' },
  { code: '13430', name: 'Magangué', regionCode: '13', regionName: 'Bolívar' },
];

class FakeCatalogsRepository extends CatalogsRepository {
  readonly searches: MunicipalitySearch[] = [];

  catalogs() {
    return of({ documentTypes: [], maritalStatuses: [], educationLevels: [], studyTypes: [], meetingTypes: [], attendanceCategories: [] });
  }
  searchMunicipalities(query: MunicipalitySearch) {
    this.searches.push(query);
    return of(MUNICIPALITIES.filter((item) => item.name.toLowerCase().includes(query.search.toLowerCase())));
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

describe('placeLabel', () => {
  it('joins the municipality and its department', () => {
    expect(placeLabel({ municipalityName: 'Magangué', regionName: 'Bolívar' })).toBe('Magangué (Bolívar)');
    expect(placeLabel({ municipalityName: 'Bogotá, D.C.', regionName: null })).toBe('Bogotá, D.C.');
    expect(placeLabel({ municipalityName: null, regionName: null })).toBe('—');
  });
});
