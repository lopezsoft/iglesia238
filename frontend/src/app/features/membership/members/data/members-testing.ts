// Test doubles shared by the specs of the members screens (not used by the application).
import { Signal, signal } from '@angular/core';
import { Observable, of } from 'rxjs';
import { Scope } from '../../../../core/auth/session.model';
import {
  MemberCreateInput,
  MemberDetail,
  MemberFilters,
  MemberListItem,
  MemberListPage,
  MemberListQuery,
  PersonOption,
  StatusChangeInput,
} from './members.models';
import { MembersRepository } from './members.repository';

export const SEDE_CENTRAL: Scope = {
  kind: 'CONGREGATION',
  denominationId: 1,
  congregationId: 10,
  label: 'Sede Central',
};
export const SEDE_NORTE: Scope = {
  kind: 'CONGREGATION',
  denominationId: 1,
  congregationId: 11,
  label: 'Sede Norte',
};

export function listItem(overrides: Partial<MemberListItem> = {}): MemberListItem {
  return {
    id: 4,
    code: 'SC-0130',
    fullName: 'Ana María Rojas Díaz',
    sex: 'FEMALE',
    documentTypeCode: 'CC',
    documentNumber: '52418916',
    age: 37,
    phone: '300 555 1004',
    joinedOn: '2008-04-10',
    status: 'ACTIVE',
    congregationId: 10,
    congregationName: 'Sede Central',
    positions: ['Diácono'],
    ...overrides,
  };
}

export function memberDetail(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    id: 4,
    code: 'SC-0130',
    status: 'ACTIVE',
    joinedOn: '2008-04-10',
    isBaptized: true,
    waterBaptismOn: '2009-05-01',
    baptismPlace: null,
    previousCongregationName: null,
    congregationId: 10,
    congregationName: 'Sede Central',
    congregationMunicipalityCode: null,
    person: {
      id: 40,
      denominationId: 1,
      userId: null,
      documentTypeCode: 'CC',
      documentNumber: '52418916',
      firstName: 'Ana María',
      lastName: 'Rojas',
      secondLastName: 'Díaz',
      sex: 'FEMALE',
      birthDate: '1989-01-01',
      maritalStatusCode: null,
      educationLevelCode: null,
      profession: null,
      occupation: null,
      phone: '300 555 1004',
      email: null,
      address: null,
      municipalityCode: null,
    },
    ...overrides,
  };
}

export function personOption(overrides: Partial<PersonOption> = {}): PersonOption {
  return {
    id: 90,
    fullName: 'Pedro Pérez',
    documentTypeCode: 'CC',
    maskedDocument: 'CC ···· 5555',
    memberCode: null,
    congregationName: null,
    ...overrides,
  };
}

/**
 * Repository that records the calls it receives and answers with canned data. Methods a spec does
 * not care about answer with empty data.
 */
export class FakeMembersRepository extends MembersRepository {
  readonly queries: MemberListQuery[] = [];
  readonly exports: MemberFilters[] = [];
  readonly pdfExports: MemberFilters[] = [];
  readonly created: MemberCreateInput[] = [];
  readonly statusChanges: StatusChangeInput[] = [];
  page: MemberListPage = {
    items: [listItem()],
    total: 25,
    page: 1,
    pageSize: 10,
    statusCounts: { ALL: 25, ACTIVE: 20, INACTIVE: 3, TRANSFERRED: 1, DECEASED: 1 },
  };
  candidates: PersonOption[] = [];
  guardians: PersonOption[] = [];
  createError: Error | null = null;
  detailAfterCreate = memberDetail({ id: 77 });

  override list(query: MemberListQuery): Observable<MemberListPage> {
    this.queries.push(query);
    return of({ ...this.page, page: query.page });
  }
  override exportCsv(filters: MemberFilters): Observable<Blob> {
    this.exports.push(filters);
    return of(new Blob(['csv'], { type: 'text/csv' }));
  }
  override exportPdf(filters: MemberFilters): Observable<Blob> {
    this.pdfExports.push(filters);
    return of(new Blob(['%PDF-'], { type: 'application/pdf' }));
  }
  override positionCatalog = () => of([{ id: 6, name: 'Diácono', isActive: true }]);
  override createMember(input: MemberCreateInput): Observable<MemberDetail> {
    this.created.push(input);
    return this.createError
      ? new Observable((subscriber) => subscriber.error(this.createError))
      : of(this.detailAfterCreate);
  }
  override searchCandidates = () => of(this.candidates);
  override searchGuardians = () => of(this.guardians);
  override detail = () => of(memberDetail());
  override updatePerson = () => of(memberDetail());
  override updateMembership = () => of(memberDetail());
  override changeStatus(_id: number, input: StatusChangeInput): Observable<MemberDetail> {
    this.statusChanges.push(input);
    return of(memberDetail({ status: input.status }));
  }
  override family = () => of([]);
  override searchRelatives = () => of([]);
  override addFamilyRelation = () => of(undefined);
  override updateFamilyRelation = () => of(undefined);
  override removeFamilyRelation = () => of(undefined);
  override studies = () => of([]);
  override addStudy = () => of(undefined);
  override updateStudy = () => of(undefined);
  override removeStudy = () => of(undefined);
  override positions = () =>
    of({
      pastoralRankId: null,
      pastoralRankName: null,
      positions: [],
      positionCatalog: [],
      rankCatalog: [],
    });
  override assignPosition = () => of(undefined);
  override closePosition = () => of(undefined);
  override setPastoralRank = () => of(undefined);
  override socioeconomicProfile = () => of(null);
  override saveSocioeconomicProfile = () => of() as never;
  override registry = () => of({ entries: [], transfers: [], statusHistory: [] });
  override transferDestinations = () => of([]);
  override transfer = () => of() as never;
  override consents = () => of([]);
  override revokeConsent = () => of(undefined);
  override anonymize = () => of(undefined);
}

export interface AuthStubOptions {
  readonly permissions?: readonly string[];
  readonly scope?: Scope;
  readonly scopes?: readonly Scope[];
}

/** AuthService stand-in: the active scope, the selectable ones and a permission check. */
export function authStub(options: AuthStubOptions = {}) {
  const scope = options.scope ?? SEDE_CENTRAL;
  const permissions = options.permissions ?? ['members.read', 'members.write'];
  const tenant: Signal<{ denominationId: number | null; congregationId: number | null }> = signal({
    denominationId: scope.denominationId,
    congregationId: scope.congregationId,
  });
  return {
    can: (permission: string) => permissions.includes(permission),
    tenant,
    activeScope: signal<Scope | null>(scope),
    user: signal({ selectableScopes: options.scopes ?? [scope] }),
  };
}

/** CatalogsStore stand-in with the catalogs the dialogs read. */
export function catalogsStub() {
  return {
    load: () => of({}),
    loadDefaultRegions: () => of([{ code: '05', name: 'Antioquia' }]),
    defaultRegions: () => [{ code: '05', name: 'Antioquia' }],
    documentTypes: () => [{ code: 'CC', name: 'Cédula de ciudadanía' }],
    maritalStatuses: () => [{ code: 'SINGLE', name: 'Soltero(a)' }],
    educationLevels: () => [{ code: 'PRIMARY', name: 'Primaria' }],
    studyTypes: () => [],
    municipality: () => undefined,
    municipalityLabel: () => '—',
    resolveMunicipality: () =>
      of({ code: '05001', name: 'Medellín', regionCode: '05', regionName: 'Antioquia' }),
  };
}

/** The test DOM has no modal dialogs: a minimal stand-in lets the dialog component open and close. */
export function polyfillDialog(): void {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
}

/** CatalogsRepository stand-in for the municipality search that the person form embeds. */
export function catalogsRepositoryStub() {
  return {
    countries: () => of([{ id: 1, isoAlpha2: 'CO', name: 'Colombia', hasMunicipalities: true }]),
    regions: () => of([{ countryId: 1, code: '05', name: 'Antioquia' }]),
    searchMunicipalities: () => of([]),
    municipality: () =>
      of({ code: '05001', name: 'Medellín', regionCode: '05', regionName: 'Antioquia' }),
  };
}
