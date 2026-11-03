import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EMPTY, Observable, firstValueFrom, of, throwError } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { Scope, SessionUser } from '../../../../core/auth/session.model';
import { DomainError } from '../../../../core/errors/domain-error';
import {
  ChildDedication,
  ChildDedicationInput,
  Marriage,
  MarriageInput,
  PastoralTerm,
  PastoralTermInput,
  PeopleQuery,
  PersonOption,
  RecordsContext,
} from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { DedicationDialogComponent } from './dedication-dialog.component';
import { MarriageDialogComponent } from './marriage-dialog.component';
import { PastoralTermDialogComponent } from './pastoral-term-dialog.component';

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

const PEOPLE: PersonOption[] = [
  {
    id: 2,
    fullName: 'Andrés Mora',
    memberCode: 'SC-0042',
    congregationId: 10,
    sex: 'MALE',
    birthDate: '1985-04-12',
    age: 41,
    maskedDocument: 'CC ···· 1111',
    hasActiveMarriage: false,
  },
  {
    id: 3,
    fullName: 'Lucía Peña',
    memberCode: 'SC-0043',
    congregationId: 10,
    sex: 'FEMALE',
    birthDate: '1988-06-02',
    age: 38,
    maskedDocument: 'CC ···· 2222',
    hasActiveMarriage: false,
  },
  {
    id: 30,
    fullName: 'Sofía Mora',
    memberCode: null,
    congregationId: null,
    sex: 'FEMALE',
    birthDate: '2024-03-14',
    age: 2,
    maskedDocument: 'RC ···· 3333',
    hasActiveMarriage: false,
  },
];

class FakeRepository extends RecordsRepository {
  readonly createdMarriages: MarriageInput[] = [];
  readonly createdDedications: ChildDedicationInput[] = [];
  readonly createdTerms: PastoralTermInput[] = [];
  marriageError: DomainError | null = null;

  override searchPeople(query: PeopleQuery) {
    const text = query.q.toLowerCase();
    return of(PEOPLE.filter((person) => person.fullName.toLowerCase().includes(text)));
  }

  override createMarriage(input: MarriageInput) {
    if (this.marriageError) {
      return throwError(() => this.marriageError);
    }
    this.createdMarriages.push(input);
    return of({} as Marriage);
  }

  override createDedication(input: ChildDedicationInput) {
    this.createdDedications.push(input);
    return of({ child: { fullName: 'Sofía Mora' } } as ChildDedication);
  }

  override createPastoralTerm(input: PastoralTermInput) {
    this.createdTerms.push(input);
    return of({ pastor: { fullName: 'Andrés Mora' } } as PastoralTerm);
  }

  override context = () => EMPTY;
  override summary = () => EMPTY;
  override dedications = () => EMPTY;
  override marriages = () => EMPTY;
  override dedication = () => EMPTY;
  override dissolveMarriage = () => EMPTY;
  override closePastoralTerm = () => EMPTY;
  override pastoralTerms = () => of([]);
}

const context: RecordsContext = {
  today: '2026-11-02',
  congregations: [{ id: 10, name: 'Sede Central' }],
};

@Component({
  imports: [MarriageDialogComponent, DedicationDialogComponent, PastoralTermDialogComponent],
  template: `
    <app-marriage-dialog
      [(open)]="marriageOpen"
      [context]="context"
      (saved)="messages.push($event)"
    />
    <app-dedication-dialog
      [(open)]="dedicationOpen"
      [context]="context"
      (saved)="messages.push($event)"
    />
    <app-pastoral-term-dialog
      [(open)]="termOpen"
      [context]="context"
      [terms]="[]"
      (saved)="messages.push($event)"
    />
  `,
})
class HostComponent {
  readonly context = context;
  readonly marriageOpen = signal(false);
  readonly dedicationOpen = signal(false);
  readonly termOpen = signal(false);
  readonly messages: string[] = [];
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
  const fixture = TestBed.createComponent(HostComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, repository, element: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: Awaited<ReturnType<typeof render>>['fixture']) {
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

/** Types in the search box of the person picker inside `scope` and chooses the first result. */
async function pickPerson(
  fixture: Awaited<ReturnType<typeof render>>['fixture'],
  scope: HTMLElement,
  label: string,
  search: string,
): Promise<void> {
  const picker = Array.from(scope.querySelectorAll('app-person-picker')).find((item) =>
    text(item.querySelector('label')).startsWith(label),
  ) as HTMLElement;
  const input = picker.querySelector<HTMLInputElement>('input[type=search]')!;
  input.value = search;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  await wait(380);
  await settle(fixture);
  picker.querySelector<HTMLButtonElement>('.results button')!.click();
  await settle(fixture);
}

describe('Record dialogs', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  describe('marriage', () => {
    async function open() {
      const world = await render();
      world.fixture.componentInstance.marriageOpen.set(true);
      await settle(world.fixture);
      return {
        ...world,
        dialog: world.element.querySelector('app-marriage-dialog') as HTMLElement,
      };
    }

    it('proposes today and the place of the sede, and asks for both spouses before saving', async () => {
      const { fixture, dialog, repository } = await open();

      expect(dialog.querySelector<HTMLInputElement>('#mar-date')?.value).toBe('2026-11-02');
      expect(dialog.querySelector<HTMLInputElement>('#mar-place')?.value).toBe(
        'Sede Central · Templo principal',
      );

      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(text(dialog)).toContain('Selecciona el primer cónyuge.');
      expect(text(dialog)).toContain('Selecciona el segundo cónyuge.');
      expect(repository.createdMarriages).toEqual([]);
    });

    it('registers the marriage with the people found on the server', async () => {
      const { fixture, dialog, repository } = await open();

      await pickPerson(fixture, dialog, 'Cónyuge 1', 'andr');
      await pickPerson(fixture, dialog, 'Cónyuge 2', 'luc');
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(repository.createdMarriages).toEqual([
        {
          spouse1Id: 2,
          spouse2Id: 3,
          marriedOn: '2026-11-02',
          place: 'Sede Central · Templo principal',
          registeredWith: 'CHURCH',
          officiantId: null,
        },
      ]);
      expect(fixture.componentInstance.messages).toEqual(['Matrimonio registrado.']);
    });

    it('shows the rule of the API when a spouse already has a marriage in force', async () => {
      const repository = new FakeRepository();
      repository.marriageError = new DomainError(
        'ACTIVE_MARRIAGE_EXISTS',
        'Uno de los cónyuges ya tiene un matrimonio vigente. Registra primero su disolución.',
        409,
      );
      const world = await render(repository);
      world.fixture.componentInstance.marriageOpen.set(true);
      await settle(world.fixture);
      const dialog = world.element.querySelector('app-marriage-dialog') as HTMLElement;

      await pickPerson(world.fixture, dialog, 'Cónyuge 1', 'andr');
      await pickPerson(world.fixture, dialog, 'Cónyuge 2', 'luc');
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(world.fixture);

      expect(text(dialog)).toContain('Registra primero su disolución.');
      expect(world.fixture.componentInstance.messages).toEqual([]);
    });
  });

  describe('child dedication', () => {
    async function open() {
      const world = await render();
      world.fixture.componentInstance.dedicationOpen.set(true);
      await settle(world.fixture);
      return {
        ...world,
        dialog: world.element.querySelector('app-dedication-dialog') as HTMLElement,
      };
    }

    it('requires the child and at least one parent or guardian', async () => {
      const { fixture, dialog, repository } = await open();
      expect(text(dialog)).toContain('Datos de menor con acceso restringido');

      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(text(dialog)).toContain('Selecciona al niño o la niña.');
      expect(text(dialog)).toContain(
        'Selecciona o escribe al menos al padre, la madre o un acudiente.',
      );
      expect(repository.createdDedications).toEqual([]);
    });

    it('records the presentation with a registered father and a mother given only by name', async () => {
      const { fixture, dialog, repository } = await open();

      await pickPerson(fixture, dialog, 'Niño(a)', 'sof');
      await pickPerson(fixture, dialog, 'Padre', 'andr');
      const mother = dialog.querySelector<HTMLInputElement>('#ded-mother-name')!;
      mother.value = '  Gloria Muñoz ';
      mother.dispatchEvent(new Event('input'));
      await settle(fixture);
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(repository.createdDedications).toEqual([
        {
          congregationId: 10,
          childId: 30,
          dedicatedOn: '2026-11-02',
          pastorId: null,
          father: { personId: 2, name: null },
          mother: { personId: null, name: 'Gloria Muñoz' },
          guardian: null,
        },
      ]);
      expect(fixture.componentInstance.messages).toEqual([
        'Presentación de Sofía Mora registrada.',
      ]);
    });

    it('does not offer the child as their own parent', async () => {
      const { fixture, dialog } = await open();

      await pickPerson(fixture, dialog, 'Niño(a)', 'sof');
      const father = Array.from(dialog.querySelectorAll('app-person-picker')).find((item) =>
        text(item.querySelector('label')).startsWith('Padre'),
      ) as HTMLElement;
      const input = father.querySelector<HTMLInputElement>('input[type=search]')!;
      input.value = 'sof';
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      await wait(380);
      await settle(fixture);

      expect(father.querySelector('.results')).toBeNull();
      expect(text(father)).toContain('Sin resultados');
    });
  });

  describe('pastoral term', () => {
    it('records the term of a pastor found on the server and closes the current one by default', async () => {
      const { fixture, element, repository } = await render();
      fixture.componentInstance.termOpen.set(true);
      await settle(fixture);
      const dialog = element.querySelector('app-pastoral-term-dialog') as HTMLElement;

      await pickPerson(fixture, dialog, 'Pastor(a)', 'andr');
      const from = dialog.querySelector<HTMLInputElement>('#term-from')!;
      from.value = '2026-11-01';
      from.dispatchEvent(new Event('input'));
      await settle(fixture);
      dialog.querySelector('form')!.dispatchEvent(new Event('submit'));
      await settle(fixture);

      expect(repository.createdTerms).toEqual([
        {
          congregationId: 10,
          pastorId: 2,
          startedOn: '2026-11-01',
          endedOn: null,
          closeCurrent: false,
        },
      ]);
      expect(fixture.componentInstance.messages).toEqual([
        'Periodo pastoral de Andrés Mora registrado.',
      ]);
    });
  });
});
