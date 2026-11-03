import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { EMPTY, Observable, firstValueFrom, of } from 'rxjs';
import { AuthGateway, InvitationInfo } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { Scope, SessionUser } from '../../../../core/auth/session.model';
import { PeopleQuery, PersonOption, PersonSummary } from '../data/records.models';
import { RecordsRepository } from '../data/records.repository';
import { PersonPickerComponent } from './person-picker.component';

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

function person(id: number, fullName: string): PersonOption {
  return {
    id,
    fullName,
    memberCode: id === 1 ? 'SC-0130' : null,
    congregationId: id === 1 ? 10 : null,
    sex: null,
    birthDate: '1990-01-01',
    age: 36,
    maskedDocument: 'CC ···· 4817',
    hasActiveMarriage: false,
  };
}

class FakeRepository extends RecordsRepository {
  readonly searches: PeopleQuery[] = [];
  override searchPeople(query: PeopleQuery) {
    this.searches.push(query);
    return of([person(1, 'Marta Castillo'), person(2, 'Martín Gil')]);
  }
  override context = () => of({ today: '2026-11-02', congregations: [] });
  override summary = () => EMPTY;
  override dedications = () => of({ items: [], total: 0, page: 1, pageSize: 10 });
  override dedication = () => EMPTY;
  override createDedication = () => EMPTY;
  override marriages = () => of({ items: [], total: 0, page: 1, pageSize: 10 });
  override createMarriage = () => EMPTY;
  override dissolveMarriage = () => EMPTY;
  override pastoralTerms = () => of([]);
  override createPastoralTerm = () => EMPTY;
  override closePastoralTerm = () => EMPTY;
}

@Component({
  imports: [ReactiveFormsModule, PersonPickerComponent],
  template: `<app-person-picker
    [formControl]="control"
    label="Cónyuge 1"
    eligibleFor="spouse"
    [required]="true"
    [exclude]="[2]"
    [error]="error()"
  />`,
})
class HostComponent {
  readonly control = new FormControl<PersonSummary | null>(null);
  readonly error = signal<string | null>(null);
}

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const text = (element: Element | null) => element?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

async function render() {
  sessionStorage.clear();
  const repository = new FakeRepository();
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

async function typeQuery(fixture: Awaited<ReturnType<typeof render>>['fixture'], value: string) {
  const input = (fixture.nativeElement as HTMLElement).querySelector<HTMLInputElement>(
    'input[type=search]',
  );
  if (!input) {
    throw new Error('No search input');
  }
  input.value = value;
  input.dispatchEvent(new Event('input'));
  fixture.detectChanges();
  await wait(380);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

describe('PersonPickerComponent', () => {
  it('does not search with less than two characters', async () => {
    const { fixture, repository } = await render();

    await typeQuery(fixture, 'm');

    expect(repository.searches).toEqual([]);
  });

  it('searches on the server with who the person is for, hides excluded people and never shows a full document', async () => {
    const { fixture, element, repository } = await render();

    await typeQuery(fixture, 'mart');

    expect(repository.searches).toEqual([{ q: 'mart', eligibleFor: 'spouse', limit: 8 }]);
    const results = text(element.querySelector('.results'));
    expect(results).toContain('Marta Castillo');
    expect(results).toContain('SC-0130 · CC ···· 4817 · 36 años');
    expect(results).not.toContain('Martín Gil');
  });

  it('puts the chosen person in the form control and clears it', async () => {
    const { fixture, element } = await render();
    await typeQuery(fixture, 'mart');

    element.querySelector<HTMLButtonElement>('.results button')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value?.id).toBe(1);
    expect(text(element.querySelector('.pick'))).toContain('Marta Castillo');

    element.querySelector<HTMLButtonElement>('.pick button')?.click();
    fixture.detectChanges();

    expect(fixture.componentInstance.control.value).toBeNull();
    expect(element.querySelector('input[type=search]')).not.toBeNull();
  });

  it('shows the error message of the form and marks the label as required', async () => {
    const { fixture, element } = await render();
    fixture.componentInstance.error.set('Selecciona el primer cónyuge.');
    fixture.detectChanges();

    expect(text(element)).toContain('Selecciona el primer cónyuge.');
    expect(text(element.querySelector('label'))).toBe('Cónyuge 1 *');
  });
});
