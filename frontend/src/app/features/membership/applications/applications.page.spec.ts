import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError } from '../../../core/errors/domain-error';
import { ApplicationsPage } from './applications.page';
import {
  ApplicationDetail,
  ApplicationListQuery,
  ApplicationQueue,
  ApprovalResult,
} from './data/applications.models';
import { ApplicationsRepository, ApproveOptions } from './data/applications.repository';
import { buildDetail, buildMatch, buildQueue, buildSummary } from './testing/application-builders';

class FakeRepository extends ApplicationsRepository {
  readonly queries: ApplicationListQuery[] = [];
  readonly approvals: { id: number; options?: ApproveOptions }[] = [];
  readonly rejections: { id: number; reason: string }[] = [];
  queue: ApplicationQueue = buildQueue();
  detail: ApplicationDetail = buildDetail();
  approveResult: Observable<ApprovalResult> = of({
    applicationId: 7,
    memberId: 3,
    memberNumber: 1,
    memberCode: 'SC-0001',
  });

  list(query: ApplicationListQuery): Observable<ApplicationQueue> {
    this.queries.push(query);
    return of(this.queue);
  }
  get(): Observable<ApplicationDetail> {
    return of(this.detail);
  }
  startReview(): Observable<ApplicationDetail> {
    return of(this.detail);
  }
  reject(id: number, reason: string): Observable<ApplicationDetail> {
    this.rejections.push({ id, reason });
    return of({ ...this.detail, status: 'REJECTED' });
  }
  markDuplicate(): Observable<ApplicationDetail> {
    return of(this.detail);
  }
  approve(id: number, options?: ApproveOptions): Observable<ApprovalResult> {
    this.approvals.push({ id, options });
    return this.approveResult;
  }
}

const sedeScope = {
  kind: 'CONGREGATION',
  denominationId: 1,
  congregationId: 10,
  label: 'Sede Central',
} as const;

async function render(
  options: { denominationWide?: boolean; inputs?: Record<string, string>; repository?: Partial<FakeRepository> } = {},
) {
  const wide = options.denominationWide ?? false;
  const tenant = signal(wide ? { denominationId: 1, congregationId: null } : { denominationId: 1, congregationId: 10 });
  const auth = {
    can: () => true,
    user: signal({
      displayName: 'Laura Gómez',
      selectableScopes: [
        sedeScope,
        { kind: 'CONGREGATION', denominationId: 1, congregationId: 11, label: 'Sede Norte' },
      ],
    }),
    tenant,
    activeScope: signal(sedeScope),
  };
  const repository = Object.assign(new FakeRepository(), options.repository);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ApplicationsRepository, useValue: repository },
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(ApplicationsPage);
  for (const [name, value] of Object.entries(options.inputs ?? {})) {
    fixture.componentRef.setInput(name, value);
  }
  await fixture.whenStable();
  return {
    fixture,
    element: fixture.nativeElement as HTMLElement,
    repository,
  };
}

function button(element: HTMLElement, label: string): HTMLButtonElement {
  const found = [...element.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes(label),
  );
  if (!found) {
    throw new Error(`No button "${label}"`);
  }
  return found;
}

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

describe('ApplicationsPage', () => {
  it('asks the API for the pending queue, page 1, newest first', async () => {
    const { element, repository } = await render();

    expect(repository.queries[0]).toMatchObject({
      filter: 'PENDING',
      search: '',
      congregationId: null,
      from: null,
      to: null,
      order: 'desc',
      page: 1,
      pageSize: 10,
    });
    expect(element.textContent).toContain('1 solicitudes pendientes');
    expect(element.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toContain('Pendientes');
    expect(element.textContent).not.toContain('Código de seguimiento');
  });

  it('builds the query from the URL: filter, search, dates, order and page', async () => {
    const { repository } = await render({
      inputs: { status: 'rejected', q: ' ana ', from: '2026-11-01', to: 'no-date', order: 'asc', page: '3' },
    });

    expect(repository.queries[0]).toMatchObject({
      filter: 'REJECTED',
      search: 'ana',
      from: '2026-11-01',
      to: null,
      order: 'asc',
      page: 3,
    });
  });

  it('narrows to a sede only with a denomination-wide scope', async () => {
    const wide = await render({ denominationWide: true, inputs: { sede: '11' } });
    expect(wide.repository.queries[0].congregationId).toBe(11);
    expect(wide.element.querySelector('#applications-sede')).not.toBeNull();
    TestBed.resetTestingModule();

    const single = await render({ inputs: { sede: '11' } });
    expect(single.repository.queries[0].congregationId).toBeNull();
    expect(single.element.querySelector('#applications-sede')).toBeNull();
  });

  it('shows an empty state that mentions the filters when they leave nothing', async () => {
    const { fixture, element, repository } = await render({ inputs: { q: 'zzz' } });
    repository.queue = { ...buildQueue([]), total: 0 };
    fixture.componentRef.setInput('q', 'zzzz');
    await fixture.whenStable();

    expect(element.textContent).toContain('Ninguna solicitud coincide con los filtros');
  });

  it('approves on top of the existing person after the confirmation', async () => {
    const { fixture, element, repository } = await render({
      repository: { detail: buildDetail({ duplicateMatch: buildMatch() }) },
    });

    button(element, 'Aprobar sobre esta persona').click();
    await fixture.whenStable();
    button(element, 'Confirmar y aprobar').click();
    await fixture.whenStable();

    expect(repository.approvals).toEqual([{ id: 7, options: { linkToPersonId: 50 } }]);
    expect(element.textContent).toContain('Miembro creado con el número');
    expect(element.textContent).toContain('SC-0001');
  });

  it('approves a free document without linking anyone', async () => {
    const { element, repository, fixture } = await render();
    repository.queue = buildQueue([buildSummary()]);
    await fixture.whenStable();

    button(element, 'Aprobar y crear miembro').click();
    await fixture.whenStable();

    expect(repository.approvals).toEqual([{ id: 7, options: undefined }]);
  });

  it('shows the message of a failed command and refreshes the state', async () => {
    const { element, repository, fixture } = await render({
      repository: {
        approveResult: throwError(
          () => new DomainError('DUPLICATE_DOCUMENT', 'Ya existe una persona con este documento.', 409),
        ),
      },
    });
    const before = repository.queries.length;

    button(element, 'Aprobar y crear miembro').click();
    await fixture.whenStable();

    expect(element.querySelector('.alert--danger')?.textContent).toContain('Ya existe una persona con este documento.');
    expect(repository.queries.length).toBeGreaterThan(before);
  });
});
