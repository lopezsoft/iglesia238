import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DomainError } from '../../core/errors/domain-error';
import { PrivacyPolicy, PrivacyPolicyDraft, PrivacyPolicyList } from './data/privacy-policy.models';
import { PrivacyPolicyRepository } from './data/privacy-policy.repository';
import { PrivacyPolicyPage } from './privacy-policy.page';

function policy(overrides: Partial<PrivacyPolicy>): PrivacyPolicy {
  return {
    id: 1,
    version: '1.0',
    content: 'Texto de la política de tratamiento de datos personales de la denominación.',
    effectiveFrom: '2026-01-01',
    status: 'PUBLISHED',
    state: 'CURRENT',
    isCurrent: true,
    publishedAt: '2026-01-01T15:00:00.000Z',
    consentCount: 12,
    applicationCount: 15,
    ...overrides,
  };
}

class FakeRepository extends PrivacyPolicyRepository {
  list$: Observable<PrivacyPolicyList> = of({
    items: [
      policy({ id: 2, version: '2.0', status: 'DRAFT', state: 'DRAFT', isCurrent: false, publishedAt: null, consentCount: 0, applicationCount: 0 }),
      policy({}),
    ],
    hasCurrentPolicy: true,
  });
  publish$: Observable<PrivacyPolicy> = of(policy({ id: 2, version: '2.0' }));
  readonly created: PrivacyPolicyDraft[] = [];
  readonly published: number[] = [];
  readonly removed: number[] = [];
  lists = 0;

  list(): Observable<PrivacyPolicyList> {
    this.lists++;
    return this.list$;
  }
  create(draft: PrivacyPolicyDraft): Observable<PrivacyPolicy> {
    this.created.push(draft);
    return of(policy({ id: 3, version: draft.version, status: 'DRAFT', state: 'DRAFT', isCurrent: false }));
  }
  update(): Observable<PrivacyPolicy> {
    return of(policy({}));
  }
  remove(id: number): Observable<void> {
    this.removed.push(id);
    return of(undefined);
  }
  publish(id: number): Observable<PrivacyPolicy> {
    this.published.push(id);
    return this.publish$;
  }
}

async function render(options: { canManage?: boolean; repository?: Partial<FakeRepository> } = {}) {
  const repository = Object.assign(new FakeRepository(), options.repository);
  TestBed.configureTestingModule({
    providers: [
      { provide: PrivacyPolicyRepository, useValue: repository },
      {
        provide: AuthService,
        useValue: { can: () => options.canManage ?? true, tenant: signal({ denominationId: 1, congregationId: null }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(PrivacyPolicyPage);
  await fixture.whenStable();
  const element = fixture.nativeElement as HTMLElement;
  const button = (label: string): HTMLButtonElement => {
    const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
      candidate.textContent?.includes(label),
    );
    if (!found) {
      throw new Error(`No button "${label}"`);
    }
    return found;
  };
  return { fixture, element, repository, button };
}

describe('PrivacyPolicyPage', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('shows the current policy, the history and the actions of a draft only', async () => {
    const { element } = await render();

    expect(element.textContent).toContain('Política vigente');
    const rows = [...element.querySelectorAll('tbody tr')];
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('2.0');
    expect(rows[0].textContent).toContain('Borrador');
    expect(rows[0].textContent).toContain('Publicar');
    expect(rows[0].textContent).toContain('Eliminar');
    expect(rows[1].textContent).toContain('Vigente');
    expect(rows[1].textContent).not.toContain('Publicar');
    expect(rows[1].textContent).not.toContain('Eliminar');
    expect(element.querySelector('.alert--warning')).toBeNull();
  });

  it('warns that the public form is closed while there is no current policy', async () => {
    const { element } = await render({
      repository: { list$: of({ items: [], hasCurrentPolicy: false }) },
    });

    expect(element.querySelector('.alert--warning')?.textContent).toContain('No hay una política vigente');
    expect(element.textContent).toContain('Aún no hay versiones');
  });

  it('is read only without the permission to manage', async () => {
    const { element } = await render({ canManage: false });

    expect(element.textContent).toContain('Solo lectura');
    const buttons = [...element.querySelectorAll('button')].map((candidate) => candidate.textContent?.trim());
    expect(buttons).not.toContain('Nueva versión');
    expect(buttons).not.toContain('Publicar');
  });

  it('creates a draft with the suggested version and reloads the list', async () => {
    const { fixture, element, repository, button } = await render();

    button('Nueva versión').click();
    await fixture.whenStable();
    const content = element.querySelector<HTMLTextAreaElement>('#policy-content')!;
    content.value = 'Esta política explica cómo tratamos los datos personales de los miembros y solicitantes.';
    content.dispatchEvent(new Event('input'));
    expect(element.querySelector<HTMLInputElement>('#policy-version')?.value).toBe('2.1');
    const listsBefore = repository.lists;

    element.querySelector<HTMLFormElement>('#policy-form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(repository.created).toHaveLength(1);
    expect(repository.created[0]).toMatchObject({ version: '2.1' });
    expect(repository.created[0].content).toContain('cómo tratamos los datos');
    expect(repository.lists).toBeGreaterThan(listsBefore);
    expect(element.textContent).toContain('Borrador 2.1 creado');
  });

  it('does not save a draft with a short text', async () => {
    const { fixture, element, repository, button } = await render();

    button('Nueva versión').click();
    await fixture.whenStable();
    element.querySelector<HTMLFormElement>('#policy-form')!.dispatchEvent(new Event('submit'));
    await fixture.whenStable();

    expect(repository.created).toEqual([]);
    expect(element.textContent).toContain('El texto debe tener entre 50 y 30000 caracteres');
  });

  it('asks for confirmation before publishing and announces the result', async () => {
    const { fixture, element, repository, button } = await render();

    button('Publicar').click();
    await fixture.whenStable();
    expect(repository.published).toEqual([]);
    expect(element.querySelector('dialog[open]')?.textContent).toContain('ya no podrás modificarlo');

    const confirm = [...element.querySelectorAll<HTMLButtonElement>('dialog[open] button')].find(
      (candidate) => candidate.textContent?.trim() === 'Publicar',
    )!;
    confirm.click();
    await fixture.whenStable();

    expect(repository.published).toEqual([2]);
    expect(element.textContent).toContain('La versión 2.0 ya es la política vigente');
  });

  it('keeps the confirmation open and shows the reason when the API refuses to publish', async () => {
    const { fixture, element, button } = await render({
      repository: {
        publish$: throwError(
          () => new DomainError('POLICY_EFFECTIVE_DATE_OUTDATED', 'Ya hay una política publicada con vigencia posterior.', 409),
        ),
      },
    });

    button('Publicar').click();
    await fixture.whenStable();
    [...element.querySelectorAll<HTMLButtonElement>('dialog[open] button')]
      .find((candidate) => candidate.textContent?.trim() === 'Publicar')!
      .click();
    await fixture.whenStable();

    expect(element.querySelector('dialog[open]')?.textContent).toContain('vigencia posterior');
  });

  it('deletes a draft after confirming', async () => {
    const { fixture, element, repository, button } = await render();

    button('Eliminar').click();
    await fixture.whenStable();
    [...element.querySelectorAll<HTMLButtonElement>('dialog[open] button')]
      .find((candidate) => candidate.textContent?.trim() === 'Eliminar')!
      .click();
    await fixture.whenStable();

    expect(repository.removed).toEqual([2]);
    expect(element.textContent).toContain('Borrador 2.0 eliminado');
  });
});
