import { TestBed } from '@angular/core/testing';
import { AuthService } from '../../../../core/auth/auth.service';
import { CatalogsRepository } from '../../../../core/catalogs/catalogs.repository';
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { DomainError } from '../../../../core/errors/domain-error';
import {
  FakeMembersRepository,
  SEDE_CENTRAL,
  SEDE_NORTE,
  authStub,
  catalogsRepositoryStub,
  catalogsStub,
  memberDetail,
  personOption,
  polyfillDialog,
} from '../data/members-testing';
import { MembersRepository } from '../data/members.repository';
import { MemberCreateDialogComponent } from './member-create-dialog.component';
import { StatusDialogComponent } from './status-dialog.component';

const DENOMINATION = {
  kind: 'DENOMINATION',
  denominationId: 1,
  congregationId: null,
  label: 'Monte de Sion',
} as const;

function configure(repo: FakeMembersRepository, auth = authStub()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: MembersRepository, useValue: repo },
      { provide: AuthService, useValue: auth },
      { provide: CatalogsStore, useValue: catalogsStub() },
      { provide: CatalogsRepository, useValue: catalogsRepositoryStub() },
    ],
  });
}

function type(element: HTMLElement, selector: string, value: string): void {
  const input = element.querySelector<HTMLInputElement>(selector)!;
  input.value = value;
  input.dispatchEvent(new Event('input'));
}

function submitButton(element: HTMLElement): HTMLButtonElement {
  return element.querySelector<HTMLButtonElement>('button[type="submit"]')!;
}

describe('MemberCreateDialogComponent', () => {
  beforeAll(polyfillDialog);

  async function open(repo = new FakeMembersRepository(), auth = authStub()) {
    configure(repo, auth);
    const fixture = TestBed.createComponent(MemberCreateDialogComponent);
    const created: number[] = [];
    fixture.componentInstance.created.subscribe((id) => created.push(id));
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    return { fixture, repo, created, element: fixture.nativeElement as HTMLElement };
  }

  function fillNewPerson(element: HTMLElement): void {
    type(element, '#create-first-name', 'Marta');
    type(element, '#create-last-name', 'Castillo');
    type(element, '#create-birth-date', '1985-04-12');
    const documentType = element.querySelector<HTMLSelectElement>('#create-document-type')!;
    documentType.value = 'CC';
    documentType.dispatchEvent(new Event('change'));
    type(element, '#create-document-number', '52.123.456');
  }

  it('does not submit without the signed authorization and says why', async () => {
    const { fixture, repo, element } = await open();
    fillNewPerson(element);

    submitButton(element).click();
    await fixture.whenStable();

    expect(repo.created).toHaveLength(0);
    expect(element.textContent).toContain('Confirma que recibiste la autorización firmada.');
  });

  it('registers a new person in the sede of the user and goes to the new file', async () => {
    const { fixture, repo, created, element } = await open();
    fillNewPerson(element);
    element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();

    submitButton(element).click();
    await fixture.whenStable();

    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]).toMatchObject({
      congregationId: null,
      existingPersonId: null,
      consentAccepted: true,
      guardianPersonId: null,
      person: {
        firstName: 'Marta',
        lastName: 'Castillo',
        documentTypeCode: 'CC',
        documentNumber: '52.123.456',
        birthDate: '1985-04-12',
      },
    });
    expect(created).toEqual([77]);
  });

  it('asks a denomination-wide user for the sede before registering', async () => {
    const auth = authStub({
      scope: DENOMINATION,
      scopes: [DENOMINATION, SEDE_CENTRAL, SEDE_NORTE],
    });
    const { fixture, repo, element } = await open(new FakeMembersRepository(), auth);
    fillNewPerson(element);
    element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();

    submitButton(element).click();
    await fixture.whenStable();
    expect(repo.created).toHaveLength(0);
    expect(element.textContent).toContain('Selecciona la sede en la que se registra el miembro.');

    const sede = element.querySelector<HTMLSelectElement>('#create-congregation')!;
    sede.value = sede.options[2].value;
    sede.dispatchEvent(new Event('change'));
    submitButton(element).click();
    await fixture.whenStable();

    expect(repo.created[0].congregationId).toBe(11);
  });

  it('requires a guardian for a minor before sending', async () => {
    const repo = new FakeMembersRepository();
    repo.guardians = [personOption({ id: 91, fullName: 'Madre de Mateo' })];
    const { fixture, element } = await open(repo);
    fillNewPerson(element);
    type(element, '#create-birth-date', '2016-03-03');
    element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await fixture.whenStable();

    submitButton(element).click();
    await fixture.whenStable();
    expect(repo.created).toHaveLength(0);
    expect(element.textContent).toContain('Selecciona al acudiente.');

    type(element, '#create-guardian-search', 'Madre');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await fixture.whenStable();
    Array.from(element.querySelectorAll<HTMLButtonElement>('.picker button'))
      .find((button) => button.textContent?.includes('Madre de Mateo'))!
      .click();
    await fixture.whenStable();
    submitButton(element).click();
    await fixture.whenStable();

    expect(repo.created[0].guardianPersonId).toBe(91);
  });

  it('shows the message of the API when the document already exists', async () => {
    const repo = new FakeMembersRepository();
    repo.createError = new DomainError(
      'DUPLICATE_DOCUMENT',
      'Ya existe un miembro con ese documento en la denominación.',
      409,
    );
    const { fixture, element } = await open(repo);
    fillNewPerson(element);
    element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();

    submitButton(element).click();
    await fixture.whenStable();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Ya existe un miembro con ese documento',
    );
  });

  it('registers an existing person found by the search', async () => {
    const repo = new FakeMembersRepository();
    repo.candidates = [personOption({ id: 90, fullName: 'Pedro Pérez' })];
    const { fixture, element } = await open(repo);
    Array.from(element.querySelectorAll<HTMLButtonElement>('.source button'))
      .find((button) => button.textContent?.includes('ya registrada'))!
      .click();
    await fixture.whenStable();

    type(element, '#create-existing-search', 'Pedro');
    await new Promise((resolve) => setTimeout(resolve, 300));
    await fixture.whenStable();
    Array.from(element.querySelectorAll<HTMLButtonElement>('.picker button'))
      .find((button) => button.textContent?.includes('Pedro Pérez'))!
      .click();
    await fixture.whenStable();
    element.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    submitButton(element).click();
    await fixture.whenStable();

    expect(repo.created[0]).toMatchObject({ existingPersonId: 90, person: null });
  });
});

describe('StatusDialogComponent', () => {
  beforeAll(polyfillDialog);

  async function open(status: 'ACTIVE' | 'INACTIVE' | 'TRANSFERRED' | 'DECEASED') {
    const repo = new FakeMembersRepository();
    configure(repo);
    const fixture = TestBed.createComponent(StatusDialogComponent);
    fixture.componentRef.setInput('member', memberDetail({ status }));
    fixture.componentRef.setInput('open', true);
    const changed: number[] = [];
    fixture.componentInstance.changed.subscribe(() => changed.push(1));
    await fixture.whenStable();
    return { fixture, repo, changed, element: fixture.nativeElement as HTMLElement };
  }

  it('offers only the statuses the member can move to', async () => {
    const active = await open('ACTIVE');
    const options = (element: HTMLElement) =>
      Array.from(element.querySelectorAll<HTMLOptionElement>('#status-target option')).map(
        (option) => option.value,
      );
    expect(options(active.element)).toEqual(['INACTIVE', 'DECEASED']);
    TestBed.resetTestingModule();

    const transferred = await open('TRANSFERRED');
    expect(options(transferred.element)).toEqual(['ACTIVE']);
  });

  it('requires a reason to leave the active status', async () => {
    const { fixture, repo, changed, element } = await open('ACTIVE');

    submitButton(element).click();
    await fixture.whenStable();
    expect(repo.statusChanges).toHaveLength(0);
    expect(element.textContent).toContain('Indica el motivo del cambio');

    const reason = element.querySelector<HTMLTextAreaElement>('#status-reason')!;
    reason.value = 'Dejó de congregarse';
    reason.dispatchEvent(new Event('input'));
    submitButton(element).click();
    await fixture.whenStable();

    expect(repo.statusChanges[0]).toMatchObject({
      status: 'INACTIVE',
      reason: 'Dejó de congregarse',
    });
    expect(changed).toHaveLength(1);
  });

  it('reactivates without asking for a reason', async () => {
    const { fixture, repo, element } = await open('INACTIVE');
    const target = element.querySelector<HTMLSelectElement>('#status-target')!;
    target.value = 'ACTIVE';
    target.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    submitButton(element).click();
    await fixture.whenStable();

    expect(repo.statusChanges[0]).toMatchObject({ status: 'ACTIVE', reason: null });
  });
});
