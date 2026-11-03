import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../core/auth/auth.gateway';
import { AuthService } from '../../../core/auth/auth.service';
import { Scope, SessionUser } from '../../../core/auth/session.model';
import { DomainError } from '../../../core/errors/domain-error';
import { Page } from '../../../shared/utils/pagination';
import {
  ChildDedication,
  DedicationQuery,
  Marriage,
  MarriageDissolutionInput,
  MarriageQuery,
  PastoralTerm,
  PersonSummary,
  RecordsContext,
  RecordsSummary,
} from './data/records.models';
import { RecordsRepository } from './data/records.repository';
import { RecordsPage } from './records.page';

const sede: Scope = {
  kind: 'CONGREGATION',
  denominationId: 1,
  congregationId: 10,
  label: 'Sede Central',
};
const session: SessionUser = {
  id: 1,
  displayName: 'Marta Castillo',
  email: 'marta@iglesia.example',
  emailVerified: true,
  assignments: [
    { role: 'SECRETARY', roleName: 'Secretaría', permissions: ['members.write'], scope: sede },
  ],
  selectableScopes: [sede],
};

class FakeAuthGateway extends AuthGateway {
  login = () => of(session);
  restore = () => of<SessionUser | null>(session);
  logout = () => of(undefined);
  requestPasswordReset = () => of(undefined);
  confirmPasswordReset = () => of(undefined);
  getInvitation = (): Observable<InvitationInfo> =>
    of({ email: 'x@y.z', displayName: null, expiresAt: null });
  acceptInvitation = () => of(undefined);
  confirmEmail = () => of(undefined);
  resendEmailVerification = () => of({ devVerificationLink: null });
  changePassword = () => of(undefined);
}

function person(id: number, fullName: string, extra: Partial<PersonSummary> = {}): PersonSummary {
  return {
    id,
    fullName,
    memberCode: null,
    congregationId: null,
    sex: null,
    birthDate: null,
    age: null,
    maskedDocument: 'CC ···· 4817',
    ...extra,
  };
}

const context: RecordsContext = {
  today: '2026-11-02',
  congregations: [{ id: 10, name: 'Sede Central' }],
};

const summary: RecordsSummary = {
  year: 2026,
  dedicationsThisYear: 3,
  dedicationsTotal: 12,
  marriagesActive: 5,
  marriagesDissolved: 1,
  termsTotal: 2,
  currentPastor: {
    congregationId: 10,
    congregationName: 'Sede Central',
    fullName: 'Daniel Herrera',
    startedOn: '2021-02-01',
  },
  congregationsWithPastor: 1,
  congregationsTotal: 1,
};

const dedication: ChildDedication = {
  id: 7,
  denominationId: 1,
  congregationId: 10,
  congregationName: 'Sede Central',
  dedicatedOn: '2026-10-25',
  child: person(30, 'Sofía Mora', { birthDate: '2024-03-14', age: 2 }),
  pastor: person(1, 'Daniel Herrera'),
  father: { personId: 2, name: 'Andrés Mora', memberCode: 'SC-0042' },
  mother: { personId: 31, name: 'Gloria Muñoz', memberCode: null },
  guardian: null,
};

function marriage(id: number, overrides: Partial<Marriage> = {}): Marriage {
  return {
    id,
    code: `MAT-000${id}`,
    denominationId: 1,
    spouse1: person(2, 'Andrés Mora', { memberCode: 'SC-0042' }),
    spouse2: person(3, 'Lucía Peña'),
    registeredWith: 'CHURCH',
    marriedOn: '2026-07-18',
    place: 'Sede Central · Templo principal',
    officiant: null,
    endedOn: null,
    endReason: null,
    status: 'ACTIVE',
    ...overrides,
  };
}

const openTerm: PastoralTerm = {
  id: 4,
  denominationId: 1,
  congregationId: 10,
  congregationName: 'Sede Central',
  pastor: person(1, 'Daniel Herrera', { memberCode: 'SC-0001' }),
  startedOn: '2021-02-01',
  endedOn: null,
};

class FakeRepository extends RecordsRepository {
  readonly dedicationQueries: DedicationQuery[] = [];
  readonly marriageQueries: MarriageQuery[] = [];
  readonly dissolved: { id: number; input: MarriageDissolutionInput }[] = [];
  readonly closed: { id: number; endedOn: string }[] = [];
  readonly opened: number[] = [];
  dissolveError: DomainError | null = null;

  override context = () => of(context);
  override summary = () => of(summary);
  override searchPeople = () => of([]);

  override dedications(query: DedicationQuery): Observable<Page<ChildDedication>> {
    this.dedicationQueries.push(query);
    return of({ items: [dedication], total: 12, page: query.page, pageSize: query.pageSize });
  }

  override dedication(id: number) {
    this.opened.push(id);
    return of(dedication);
  }

  override createDedication = () => EMPTY;

  override marriages(query: MarriageQuery): Observable<Page<Marriage>> {
    this.marriageQueries.push(query);
    return of({
      items: [
        marriage(1),
        marriage(2, { status: 'DISSOLVED', endedOn: '2026-09-01', endReason: 'DIVORCE' }),
      ],
      total: 2,
      page: query.page,
      pageSize: query.pageSize,
    });
  }

  override createMarriage = () => EMPTY;

  override dissolveMarriage(id: number, input: MarriageDissolutionInput) {
    if (this.dissolveError) {
      return throwError(() => this.dissolveError);
    }
    this.dissolved.push({ id, input });
    return of(
      marriage(id, { status: 'DISSOLVED', endedOn: input.endedOn, endReason: input.endReason }),
    );
  }

  override pastoralTerms = () => of([openTerm]);
  override createPastoralTerm = () => EMPTY;

  override closePastoralTerm(id: number, endedOn: string) {
    this.closed.push({ id, endedOn });
    return of({ ...openTerm, endedOn });
  }
}

const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function render(repository = new FakeRepository()) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: FakeAuthGateway },
      { provide: RecordsRepository, useValue: repository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login('marta@iglesia.example', 'x'));
  const fixture = TestBed.createComponent(RecordsPage);
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, repository, element: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: Awaited<ReturnType<typeof render>>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

function click(element: HTMLElement, selector: string, containing?: string): void {
  const candidates = Array.from(element.querySelectorAll<HTMLElement>(selector));
  const target = containing
    ? candidates.find((item) => text(item).includes(containing))
    : candidates[0];
  if (!target) {
    throw new Error(`Missing ${selector} ${containing ?? ''}`);
  }
  target.click();
}

describe('RecordsPage', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('shows the figures of the summary and the presentations of the first tab, masked', async () => {
    const { element, repository } = await render();

    expect(text(element)).toContain('Presentaciones en 2026');
    expect(text(element)).toContain('Daniel Herrera');
    expect(text(element)).toContain('Desde 01/02/2021');
    const row = text(element.querySelector('app-dedications-panel tbody tr'));
    expect(row).toContain('Sofía Mora');
    expect(row).toContain('CC ···· 4817');
    expect(row).toContain('Andrés Mora');
    expect(row).toContain('SC-0042');
    expect(repository.dedicationQueries[0]).toMatchObject({ page: 1, pageSize: 10 });
    expect(text(element.querySelector('app-dedications-panel'))).toContain(
      'Datos de menores: acceso restringido',
    );
  });

  it('pages and filters the dedications on the server', async () => {
    const { fixture, element, repository } = await render();

    click(element, 'app-dedications-panel app-pagination button', 'Siguiente');
    await settle(fixture);
    expect(repository.dedicationQueries.at(-1)).toMatchObject({ page: 2 });

    const search = element.querySelector<HTMLInputElement>('#ded-search');
    search!.value = 'sofia';
    search!.dispatchEvent(new Event('input'));
    await wait(380);
    await settle(fixture);
    expect(repository.dedicationQueries.at(-1)).toMatchObject({ page: 1, q: 'sofia' });
  });

  it('opens the detail of a record in a drawer (the API audits that read)', async () => {
    const { fixture, element, repository } = await render();

    click(element, 'app-dedications-panel tbody button', 'Ver');
    await settle(fixture);

    expect(repository.opened).toEqual([7]);
    const drawer = text(element.querySelector('app-dedications-panel app-dialog'));
    expect(drawer).toContain('Esta consulta quedó registrada en la auditoría.');
    expect(drawer).toContain('Gloria Muñoz');
  });

  it('lists the marriages of the second tab and registers a dissolution', async () => {
    const { fixture, element, repository } = await render();

    click(element, 'app-tab-cards button', 'Matrimonios');
    await settle(fixture);
    expect(text(element.querySelector('app-marriages-panel'))).toContain('MAT-0001');
    expect(text(element.querySelector('app-marriages-panel'))).toContain('Divorcio');

    click(element, 'app-marriages-panel tbody button', 'Registrar disolución');
    await settle(fixture);
    const dialog = element.querySelector('app-dissolution-dialog') as HTMLElement;
    expect(text(dialog)).toContain('MAT-0001');
    const reason = dialog.querySelector<HTMLSelectElement>('#dis-reason')!;
    reason.value = reason.options[1].value;
    reason.dispatchEvent(new Event('change'));
    await settle(fixture);
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(repository.dissolved).toEqual([
      { id: 1, input: { endedOn: '2026-11-02', endReason: 'DIVORCE' } },
    ]);
    expect(text(element)).toContain('Se registró la disolución del matrimonio MAT-0001.');
  });

  it('shows the message of the API when the dissolution is rejected', async () => {
    const repository = new FakeRepository();
    repository.dissolveError = new DomainError(
      'ALREADY_DISSOLVED',
      'Este matrimonio ya tiene registrada su disolución.',
      409,
    );
    const { fixture, element } = await render(repository);

    click(element, 'app-tab-cards button', 'Matrimonios');
    await settle(fixture);
    click(element, 'app-marriages-panel tbody button', 'Registrar disolución');
    await settle(fixture);
    const dialog = element.querySelector('app-dissolution-dialog') as HTMLElement;
    const reason = dialog.querySelector<HTMLSelectElement>('#dis-reason')!;
    reason.value = reason.options[2].value;
    reason.dispatchEvent(new Event('change'));
    await settle(fixture);
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(text(dialog)).toContain('Este matrimonio ya tiene registrada su disolución.');
  });

  it('shows the pastoral timeline and closes the open term', async () => {
    const { fixture, element, repository } = await render();

    click(element, 'app-tab-cards button', 'Periodos pastorales');
    await settle(fixture);
    expect(text(element.querySelector('app-pastoral-terms-panel'))).toContain('Periodo actual');

    click(element, 'app-pastoral-terms-panel button', 'Cerrar periodo');
    await settle(fixture);
    const dialog = element.querySelector('app-close-term-dialog') as HTMLElement;
    expect(text(dialog)).toContain('Daniel Herrera');
    dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle(fixture);

    expect(repository.closed).toEqual([{ id: 4, endedOn: '2026-11-02' }]);
    expect(text(element)).toContain('Periodo de Daniel Herrera cerrado.');
  });

  it('shows an error banner when the context cannot be loaded', async () => {
    const repository = new FakeRepository();
    repository.context = () =>
      throwError(() => new DomainError('SERVER_ERROR', 'Falló el servidor.'));
    const { element } = await render(repository);

    expect(text(element.querySelector('app-error-banner'))).toContain('Falló el servidor.');
  });
});
