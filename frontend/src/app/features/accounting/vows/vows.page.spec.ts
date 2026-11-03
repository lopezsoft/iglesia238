import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError } from '../../../core/errors/domain-error';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { PersonOption } from '../data/accounting.models';
import { ExportedFile } from '../data/accounting-http';
import {
  CreateVowPledgeCommand,
  UpdateVowPledgeCommand,
  VowFilters,
  VowPledgeDetail,
  VowPledgeRow,
  VowsOverview,
  VowsQuery,
} from './data/vows.models';
import { VowsRepository } from './data/vows.repository';
import { VowsPage } from './vows.page';

function pledge(overrides: Partial<VowPledgeRow> = {}): VowPledgeRow {
  return {
    id: 7,
    code: 'VOTO-2026-0007',
    personId: 5,
    personName: 'Ana Pérez',
    memberCode: 'SC-0130',
    contributionTypeId: 3,
    typeName: 'Voto',
    description: 'Ampliación del templo',
    pledgedAmount: 1_000_000,
    pledgedOn: '2026-03-01',
    dueOn: null,
    isOverdue: false,
    paid: 550_000,
    balance: 450_000,
    progress: 55,
    status: 'ACTIVE',
    lastPaymentOn: '2026-10-25',
    paymentCount: 3,
    congregationName: 'Sede Central',
    ...overrides,
  };
}

function overview(overrides: Partial<VowsOverview> = {}): VowsOverview {
  return {
    today: '2026-11-02',
    congregationScoped: true,
    scopeLabel: 'Sede Central',
    vowTypes: [{ id: 3, name: 'Voto' }],
    kpis: {
      pledgedTotal: 3_000_000,
      paidTotal: 1_200_000,
      balanceTotal: 1_800_000,
      pledgeCount: 4,
      withBalanceCount: 3,
      activeCount: 3,
      staleCount: 1,
      overdueCount: 2,
    },
    statusCounts: { ALL: 6, ACTIVE: 3, FULFILLED: 2, CANCELLED: 1 },
    items: [pledge(), pledge({ id: 8, code: 'VOTO-2026-0008', personName: 'Luis Gómez', status: 'ACTIVE', dueOn: '2026-10-01', isOverdue: true })],
    total: 23,
    page: 1,
    pageSize: 10,
    ...overrides,
  };
}

class FakeRepository extends VowsRepository {
  readonly queries: VowsQuery[] = [];
  readonly exports: VowFilters[] = [];
  readonly updates: Array<{ id: number; command: UpdateVowPledgeCommand }> = [];
  readonly cancels: Array<{ id: number; reason: string }> = [];
  readonly creates: CreateVowPledgeCommand[] = [];
  data: VowsOverview = overview();
  fail = false;

  override overview(query: VowsQuery): Observable<VowsOverview> {
    this.queries.push(query);
    return this.fail
      ? throwError(() => new DomainError('SERVER_ERROR', 'No fue posible.'))
      : of({ ...this.data, page: query.page });
  }
  override detail(id: number): Observable<VowPledgeDetail> {
    return of({
      ...pledge({ id }),
      documentHint: 'CC ···1904',
      fundName: 'Fondo de Construcción',
      payments: [
        {
          id: 1,
          receivedOn: '2026-10-25',
          receiptNumber: 'REC-2026-00012',
          amount: 100_000,
          paymentMethod: 'CASH',
          status: 'RECORDED',
          congregationName: 'Sede Central',
        },
      ],
      cancelReason: null,
    });
  }
  override create(command: CreateVowPledgeCommand): Observable<VowPledgeRow> {
    this.creates.push(command);
    return of(pledge({ id: 20, code: 'VOTO-2026-0020' }));
  }
  override update(id: number, command: UpdateVowPledgeCommand): Observable<VowPledgeRow> {
    this.updates.push({ id, command });
    return of(pledge({ id }));
  }
  override cancel(id: number, reason: string): Observable<VowPledgeRow> {
    this.cancels.push({ id, reason });
    return of(pledge({ id, status: 'CANCELLED' }));
  }
  override searchPersons(): Observable<PersonOption[]> {
    return of([]);
  }
  override exportCsv(filters: VowFilters): Observable<ExportedFile> {
    this.exports.push(filters);
    return of({ blob: new Blob(['x']), filename: 'votos-2026-11-02.csv' });
  }
}

beforeAll(() => {
  // jsdom does not implement the modal methods of <dialog>.
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

async function setup(permissions: readonly string[] = ['contributions.read', 'contributions.write'], data?: VowsOverview) {
  const repository = new FakeRepository();
  if (data) {
    repository.data = data;
  }
  const saved: string[] = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: VowsRepository, useValue: repository },
      {
        provide: AuthService,
        useValue: {
          can: (permission: string) => permissions.includes(permission),
          tenant: signal({ denominationId: 1, congregationId: 10 }),
        },
      },
      { provide: FileDownloadService, useValue: { save: (_blob: Blob, filename: string) => saved.push(filename) } },
    ],
  });
  const fixture = TestBed.createComponent(VowsPage);
  await settle(fixture);
  return { fixture, repository, saved, element: fixture.nativeElement as HTMLElement };
}

describe('VowsPage', () => {
  it('shows the KPIs of the scope, the counts per status and the rows of the page', async () => {
    const { repository, element } = await setup();

    expect(repository.queries[0]).toMatchObject({ page: 1, pageSize: 10, status: null, contributionTypeId: null, search: null, overdueOnly: false });
    const kpis = element.querySelector('.kpi-grid')?.textContent ?? '';
    expect(kpis).toContain('3.000.000');
    expect(kpis).toContain('1.800.000');
    expect(kpis).toContain('1 sin abonos en 90 días');
    expect(kpis).toContain('2 vencidas');
    const chips = [...element.querySelectorAll('.filters .btn--sm')].map((b) => b.textContent?.replace(/\s+/g, ' ').trim());
    expect(chips.slice(0, 4)).toEqual(['Todas 6', 'Activa 3', 'Cumplida 2', 'Cancelada 1']);
    const table = element.querySelector('app-vows-table')?.textContent ?? '';
    expect(table).toContain('VOTO-2026-0007');
    expect(table).toContain('Luis Gómez');
    expect(table).toContain('Vencida');
    expect(table).toContain('23 resultados');
  });

  it('filters by status in the server and goes back to the first page', async () => {
    const { fixture, repository, element } = await setup();
    const next = [...element.querySelectorAll<HTMLButtonElement>('app-pagination button')].find((b) => b.textContent?.includes('Siguiente'))!;
    next.click();
    await settle(fixture);
    expect(repository.queries.at(-1)).toMatchObject({ page: 2 });

    [...element.querySelectorAll<HTMLButtonElement>('.filters .btn--sm')].find((b) => b.textContent?.includes('Cumplida'))!.click();
    await settle(fixture);

    expect(repository.queries.at(-1)).toMatchObject({ status: 'FULFILLED', page: 1 });
  });

  it('sends the type and the overdue filters, and clears them', async () => {
    const { fixture, repository, element } = await setup();
    const type = element.querySelector<HTMLSelectElement>('#vow-type-filter')!;
    type.value = '3';
    type.dispatchEvent(new Event('change'));
    element.querySelector<HTMLInputElement>('#vow-overdue')!.click();
    await settle(fixture);
    expect(repository.queries.at(-1)).toMatchObject({ contributionTypeId: 3, overdueOnly: true });

    [...element.querySelectorAll<HTMLButtonElement>('.toolbar button')].find((b) => b.textContent?.includes('Limpiar'))!.click();
    await settle(fixture);

    expect(repository.queries.at(-1)).toMatchObject({ contributionTypeId: null, overdueOnly: false, status: null });
  });

  it('debounces the search box', async () => {
    const { fixture, repository, element } = await setup();
    const input = element.querySelector<HTMLInputElement>('#vow-search')!;

    for (const text of ['V', 'VO', 'VOTO-2026-0007']) {
      input.value = text;
      input.dispatchEvent(new Event('input'));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle(fixture);

    expect(repository.queries.map((q) => q.search).filter((s) => s !== null)).toEqual(['VOTO-2026-0007']);
  });

  it('exports the CSV of the current filters', async () => {
    const { fixture, repository, saved, element } = await setup();
    [...element.querySelectorAll<HTMLButtonElement>('.filters .btn--sm')].find((b) => b.textContent?.includes('Activa'))!.click();
    await settle(fixture);

    element.querySelector<HTMLButtonElement>('app-export-actions button')!.click();
    await settle(fixture);

    expect(repository.exports[0]).toMatchObject({ status: 'ACTIVE' });
    expect(saved).toEqual(['votos-2026-11-02.csv']);
  });

  it('opens the detail with the payments and offers edit, cancel and "Registrar abono" to writers', async () => {
    const { fixture, element } = await setup();

    element.querySelector<HTMLButtonElement>('app-vows-table .link-button')!.click();
    await settle(fixture);

    const drawer = element.querySelector('app-vow-detail-drawer')?.textContent ?? '';
    expect(drawer).toContain('REC-2026-00012');
    expect(drawer).toContain('Fondo de Construcción');
    expect(drawer).toContain('Editar');
    expect(drawer).toContain('Cancelar promesa');
    expect(drawer).toContain('Registrar abono');
  });

  it('edits only the fields that changed', async () => {
    const { fixture, repository, element } = await setup();
    element.querySelector<HTMLButtonElement>('app-vows-table .link-button')!.click();
    await settle(fixture);
    [...element.querySelectorAll<HTMLButtonElement>('app-vow-detail-drawer button')].find((b) => b.textContent?.includes('Editar'))!.click();
    await settle(fixture);

    const due = element.querySelector<HTMLInputElement>('#edit-vow-due')!;
    due.value = '2027-06-30';
    due.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[form="edit-vow-form"]')!.click();
    await settle(fixture);

    expect(repository.updates).toEqual([{ id: 7, command: { dueOn: '2027-06-30' } }]);
    expect(element.textContent).toContain('Promesa VOTO-2026-0007 actualizada');
  });

  it('cancels with a reason of at least ten characters', async () => {
    const { fixture, repository, element } = await setup();
    element.querySelector<HTMLButtonElement>('app-vows-table .link-button')!.click();
    await settle(fixture);
    [...element.querySelectorAll<HTMLButtonElement>('app-vow-detail-drawer button')].find((b) => b.textContent?.includes('Cancelar promesa'))!.click();
    await settle(fixture);

    const reason = element.querySelector<HTMLTextAreaElement>('#cancel-vow-reason')!;
    reason.value = 'corto';
    reason.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[form="cancel-vow-form"]')!.click();
    await settle(fixture);
    expect(repository.cancels).toHaveLength(0);
    expect(element.textContent).toContain('Describe el motivo (mínimo 10 caracteres).');

    reason.value = 'El miembro cambió de ciudad.';
    reason.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[form="cancel-vow-form"]')!.click();
    await settle(fixture);

    expect(repository.cancels).toEqual([{ id: 7, reason: 'El miembro cambió de ciudad.' }]);
    expect(element.textContent).toContain('Promesa VOTO-2026-0007 cancelada');
  });

  it('is read-only without contributions.write', async () => {
    const { fixture, element } = await setup(['contributions.read']);

    expect(element.querySelector('app-page-header')?.textContent).not.toContain('Nueva promesa');
    expect(element.querySelector('app-read-only-notice')).not.toBeNull();
    expect(element.querySelector('app-vows-table')?.textContent).not.toContain('Abonar');

    element.querySelector<HTMLButtonElement>('app-vows-table .link-button')!.click();
    await settle(fixture);
    const drawer = element.querySelector('app-vow-detail-drawer')?.textContent ?? '';
    expect(drawer).not.toContain('Editar');
    expect(drawer).not.toContain('Cancelar promesa');
  });

  it('is read-only and shows the sede column when the view is denomination-wide', async () => {
    const { element } = await setup(undefined, overview({ congregationScoped: false, scopeLabel: 'todas las sedes' }));

    expect(element.textContent).toContain('Vista consolidada de todas las sedes');
    expect(element.querySelector('app-page-header')?.textContent).not.toContain('Nueva promesa');
    expect(element.querySelector('app-vows-table')?.textContent).toContain('Sede Central');
  });

  it('shows an error banner with a retry when the first load fails', async () => {
    const repository = new FakeRepository();
    repository.fail = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: VowsRepository, useValue: repository },
        { provide: AuthService, useValue: { can: () => false, tenant: signal({ denominationId: 1, congregationId: 10 }) } },
      ],
    });
    const fixture = TestBed.createComponent(VowsPage);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('app-error-banner')?.textContent).toContain('No fue posible cargar las promesas');
  });
});
