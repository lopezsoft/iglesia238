import { signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError } from '../../../core/errors/domain-error';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { PersonOption } from '../data/accounting.models';
import { ExportedFile } from '../data/accounting-http';
import { ContributionsPage } from './contributions.page';
import {
  ContributionDetail,
  ContributionFilters,
  ContributionFormOptions,
  ContributionListing,
  ContributionQuery,
  ContributionRow,
  RecordContributionCommand,
  VowPaymentTarget,
  VowPledgeOption,
} from './data/contributions.models';
import { ContributionsRepository } from './data/contributions.repository';

function row(overrides: Partial<ContributionRow> = {}): ContributionRow {
  return {
    id: 1,
    receiptNumber: 'REC-2026-00001',
    voucherId: 1,
    receivedOn: '2026-11-02',
    contributionTypeId: 1,
    typeName: 'Diezmo',
    category: 'TITHE',
    personId: 5,
    contributorName: 'Ana Pérez',
    memberCode: 'SC-0130',
    vowPledgeId: null,
    vowPledgeCode: null,
    paymentMethod: 'CASH',
    paymentReference: null,
    notes: null,
    amount: 250_000,
    status: 'RECORDED',
    voidBlock: null,
    voidReason: null,
    congregationName: 'Sede Central',
    ...overrides,
  };
}

function listing(overrides: Partial<ContributionListing> = {}): ContributionListing {
  return {
    items: [row(), row({ id: 2, receiptNumber: 'REC-2026-00002', contributorName: null, personId: null, memberCode: null, notes: 'Culto dominical', typeName: 'Ofrenda', category: 'OFFERING', amount: 100_000 })],
    total: 31,
    page: 1,
    pageSize: 15,
    from: '2026-11-01',
    to: '2026-11-30',
    label: 'Noviembre 2026',
    periodStatus: 'OPEN',
    summary: [
      { category: 'TITHE', amount: 250_000, count: 1, share: 71 },
      { category: 'OFFERING', amount: 100_000, count: 1, share: 29 },
      { category: 'FIRST_FRUITS', amount: 0, count: 0, share: 0 },
      { category: 'VOW', amount: 0, count: 0, share: 0 },
    ],
    totalAmount: 350_000,
    voidedCount: 2,
    ...overrides,
  };
}

const OPTIONS: ContributionFormOptions = {
  today: '2026-11-02',
  congregationScoped: true,
  scopeLabel: 'Sede Central',
  types: [
    { id: 1, name: 'Diezmo', category: 'TITHE' },
    { id: 2, name: 'Ofrenda', category: 'OFFERING' },
  ],
  periods: [
    { year: 2026, month: 11, status: 'OPEN', label: 'Noviembre 2026' },
    { year: 2026, month: 10, status: 'CLOSED', label: 'Octubre 2026' },
  ],
  minDate: '2026-11-01',
  maxDate: '2026-11-02',
  settledTitheRanges: [],
  nextReceiptNumber: 'REC-2026-00003',
};

class FakeRepository extends ContributionsRepository {
  readonly queries: ContributionQuery[] = [];
  readonly exports: ContributionFilters[] = [];
  readonly receipts: number[] = [];
  failReceipt = false;
  readonly voided: Array<{ id: number; reason: string }> = [];
  options: ContributionFormOptions = OPTIONS;
  failList = false;

  override formOptions(): Observable<ContributionFormOptions> {
    return of(this.options);
  }
  override list(query: ContributionQuery): Observable<ContributionListing> {
    this.queries.push(query);
    return this.failList
      ? throwError(() => new DomainError('SERVER_ERROR', 'No fue posible.'))
      : of(listing({ page: query.page }));
  }
  override detail(id: number): Observable<ContributionDetail> {
    return of({
      ...row({ id }),
      recordedAt: '2026-11-02T15:00:00.000Z',
      recordedByName: 'Tesorera',
      voidedAt: null,
      voidedByName: null,
      consolidationVoucher: null,
      settlementId: null,
    });
  }
  override searchPersons(): Observable<PersonOption[]> {
    return of([]);
  }
  override openPledges(): Observable<VowPledgeOption[]> {
    return of([]);
  }
  override vowPaymentTarget(): Observable<VowPaymentTarget> {
    return throwError(() => new DomainError('NOT_FOUND', 'No existe.'));
  }
  override record(_command: RecordContributionCommand): Observable<ContributionRow> {
    return of(row());
  }
  override void(id: number, reason: string): Observable<ContributionRow> {
    this.voided.push({ id, reason });
    return of(row({ id, status: 'VOIDED', voidReason: reason }));
  }
  override receiptPdf(voucherId: number): Observable<Blob> {
    this.receipts.push(voucherId);
    return this.failReceipt
      ? throwError(() => new DomainError('NOT_FOUND', 'El comprobante no existe.', 404))
      : of(new Blob(['%PDF-']));
  }
  override exportCsv(filters: ContributionFilters): Observable<ExportedFile> {
    this.exports.push(filters);
    return of({ blob: new Blob(['a;b']), filename: 'aportes-2026-11-01_2026-11-30.csv' });
  }
}

interface SetupOptions {
  permissions?: readonly string[];
  tenant?: { denominationId: number | null; congregationId: number | null };
  options?: ContributionFormOptions;
}

async function setup({ permissions = ['contributions.read', 'contributions.write'], tenant, options }: SetupOptions = {}) {
  const repository = new FakeRepository();
  repository.options = options ?? OPTIONS;
  const saved: Array<{ blob: Blob; filename: string }> = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: ContributionsRepository, useValue: repository },
      {
        provide: AuthService,
        useValue: {
          can: (permission: string) => permissions.includes(permission),
          tenant: signal(tenant ?? { denominationId: 1, congregationId: 10 }),
        },
      },
      { provide: FileDownloadService, useValue: { save: (blob: Blob, filename: string) => saved.push({ blob, filename }) } },
    ],
  });
  const fixture = TestBed.createComponent(ContributionsPage);
  await settle(fixture);
  return { fixture, repository, saved, element: fixture.nativeElement as HTMLElement };
}

async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  for (let round = 0; round < 3; round += 1) {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  fixture.detectChanges();
}

function select(element: HTMLElement, id: string, value: string): void {
  const control = element.querySelector<HTMLSelectElement>(`#${id}`)!;
  control.value = value;
  control.dispatchEvent(new Event('change'));
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

describe('ContributionsPage', () => {
  it('asks the server for the month of today and shows the totals, the categories and the rows', async () => {
    const { repository, element } = await setup();

    expect(repository.queries[0]).toMatchObject({ year: 2026, month: 11, page: 1, pageSize: 15, category: null, status: null, search: null });
    expect(element.querySelector('app-hero-card')?.textContent).toContain('350.000');
    expect(element.querySelector('app-hero-card')?.textContent).toContain('Recaudo de noviembre 2026');
    expect(element.querySelector('app-hero-card')?.textContent).toContain('2 anulados no suman');
    expect(element.querySelector('app-contribution-summary')?.textContent).toContain('Diezmos');
    const text = element.querySelector('app-contributions-table')?.textContent ?? '';
    expect(text).toContain('REC-2026-00001');
    expect(text).toContain('Ana Pérez');
    // A collection shows its description instead of a name.
    expect(text).toContain('Colecta agregada');
    expect(text).toContain('Culto dominical');
    expect(text).toContain('31 resultados');
  });

  it('sends a changed filter to the server from the first page', async () => {
    const { fixture, repository } = await setup();

    select(fixture.nativeElement, 'filter-category', 'OFFERING');
    await settle(fixture);

    expect(repository.queries.at(-1)).toMatchObject({ category: 'OFFERING', page: 1 });
  });

  it('changes the month and asks for another page without losing the filters', async () => {
    const { fixture, repository, element } = await setup();

    select(element, 'filter-status', 'VOIDED');
    await settle(fixture);
    const next = [...element.querySelectorAll<HTMLButtonElement>('app-pagination button')].find((b) => b.textContent?.includes('Siguiente'))!;
    next.click();
    await settle(fixture);
    select(element, 'filter-period', '2026-10');
    await settle(fixture);

    expect(repository.queries.some((q) => q.status === 'VOIDED' && q.page === 2)).toBe(true);
    // Changing the period goes back to the first page and keeps the status filter.
    expect(repository.queries.at(-1)).toMatchObject({ year: 2026, month: 10, status: 'VOIDED', page: 1 });
  });

  it('waits for both dates of a custom range before asking', async () => {
    const { fixture, repository, element } = await setup();
    const before = repository.queries.length;

    select(element, 'filter-period', 'custom');
    await settle(fixture);
    expect(repository.queries.length).toBe(before);
    expect(element.textContent).toContain('Indica el rango de fechas');

    for (const [id, value] of [['filter-from', '2026-10-01'], ['filter-to', '2026-11-15']]) {
      const input = element.querySelector<HTMLInputElement>(`#${id}`)!;
      input.value = value;
      input.dispatchEvent(new Event('change'));
      await settle(fixture);
    }

    expect(repository.queries.at(-1)).toMatchObject({ from: '2026-10-01', to: '2026-11-15', page: 1 });
    expect(repository.queries.at(-1)?.month).toBeUndefined();
  });

  it('debounces the search text', async () => {
    const { fixture, repository, element } = await setup();
    const input = element.querySelector<HTMLInputElement>('#filter-search')!;

    for (const text of ['A', 'An', 'Ana']) {
      input.value = text;
      input.dispatchEvent(new Event('input'));
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
    await settle(fixture);

    const searches = repository.queries.map((q) => q.search).filter((s) => s !== null);
    expect(searches).toEqual(['Ana']);
  });

  it('exports the CSV of the current filters and hands it to the browser', async () => {
    const { fixture, repository, saved, element } = await setup();
    select(element, 'filter-method', 'CARD');
    await settle(fixture);

    element.querySelector<HTMLButtonElement>('app-export-actions button')!.click();
    await settle(fixture);

    expect(repository.exports[0]).toMatchObject({ year: 2026, month: 11, paymentMethod: 'CARD' });
    expect(repository.exports[0]).not.toHaveProperty('page');
    expect(saved.map((file) => file.filename)).toEqual(['aportes-2026-11-01_2026-11-30.csv']);
  });

  it('downloads the receipt of a row as a PDF through the session', async () => {
    const { fixture, repository, saved, element } = await setup();

    const button = element.querySelector<HTMLButtonElement>('button[aria-label="Descargar el recibo REC-2026-00001 en PDF"]');
    button!.click();
    await settle(fixture);

    expect(repository.receipts).toEqual([1]);
    expect(saved.map((file) => file.filename)).toEqual(['REC-2026-00001.pdf']);
  });

  it('offers the receipt right after recording a contribution', async () => {
    const { fixture, repository, saved, element } = await setup();

    (fixture.componentInstance as unknown as { onRecorded(row: ContributionRow): void }).onRecorded(row({ id: 7, voucherId: 7 }));
    await settle(fixture);
    const offer = [...element.querySelectorAll<HTMLButtonElement>('.flash button')].find((b) => b.textContent?.includes('Descargar recibo'));
    offer!.click();
    await settle(fixture);

    expect(repository.receipts).toEqual([7]);
    expect(saved).toHaveLength(1);
  });

  it('says why the receipt could not be downloaded, with the message of the API', async () => {
    const { fixture, repository, element } = await setup();
    repository.failReceipt = true;

    element.querySelector<HTMLButtonElement>('button[aria-label^="Descargar el recibo"]')!.click();
    await settle(fixture);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('El comprobante no existe.');
  });

  it('denomination-wide has no receipt button: the voucher belongs to one sede', async () => {
    const { element } = await setup({
      tenant: { denominationId: 1, congregationId: null },
      options: { ...OPTIONS, congregationScoped: false, nextReceiptNumber: null },
    });

    expect(element.querySelector('button[aria-label^="Descargar el recibo"]')).toBeNull();
  });

  it('shows the registration form with the next receipt to roles that can write', async () => {
    const { element } = await setup();

    expect(element.querySelector('app-contribution-form')).not.toBeNull();
    expect(element.querySelector('app-section-panel')?.textContent).toContain('REC-2026-00003');
  });

  it('is read-only without contributions.write: no form, no void buttons, and it says why', async () => {
    const { element } = await setup({ permissions: ['contributions.read'] });

    expect(element.querySelector('app-contribution-form')).toBeNull();
    // In words, not as the permission code: the person cannot do anything with `contributions.write`.
    expect(element.querySelector('app-read-only-notice')?.textContent).toContain('Registrar y anular aportes');
    expect(element.querySelector('app-read-only-notice')?.textContent).not.toContain('contributions.write');
    expect(element.textContent).not.toContain('Nuevo aporte');
    expect([...element.querySelectorAll('app-contributions-table button')].some((b) => b.textContent?.trim() === 'Anular')).toBe(false);
  });

  it('denomination-wide: aggregated and read-only, with the sede column', async () => {
    const { element } = await setup({
      tenant: { denominationId: 1, congregationId: null },
      options: { ...OPTIONS, congregationScoped: false, nextReceiptNumber: null },
    });

    expect(element.textContent).toContain('Vista consolidada de todas las sedes');
    expect(element.querySelector('app-contribution-form')).toBeNull();
    expect(element.querySelector('app-contributions-table')?.textContent).toContain('Sede Central');
  });

  it('offers to void a recorded contribution and not a consolidated one', async () => {
    const { fixture, repository, element } = await setup();
    repository.queries.length = 0;

    const buttons = [...element.querySelectorAll<HTMLButtonElement>('app-contributions-table button')].filter((b) => b.textContent?.includes('Anular'));
    expect(buttons.length).toBe(2);
    buttons[0].click();
    await settle(fixture);

    expect(element.querySelector('app-void-contribution-dialog')?.textContent).toContain('REC-2026-00001');
  });

  it('voids a contribution with the reason and reloads the list', async () => {
    const { fixture, repository, element } = await setup();
    const first = [...element.querySelectorAll<HTMLButtonElement>('app-contributions-table button')].find((b) => b.textContent?.includes('Anular'))!;
    first.click();
    await settle(fixture);
    const before = repository.queries.length;

    const reason = element.querySelector<HTMLTextAreaElement>('#void-reason')!;
    reason.value = 'Valor digitado con error; se registra de nuevo.';
    reason.dispatchEvent(new Event('input'));
    element.querySelector<HTMLButtonElement>('button[form="void-form"]')!.click();
    await settle(fixture);

    expect(repository.voided).toEqual([{ id: 1, reason: 'Valor digitado con error; se registra de nuevo.' }]);
    expect(repository.queries.length).toBeGreaterThan(before);
    expect(element.textContent).toContain('Aporte REC-2026-00001 anulado');
  });

  it('opens the detail of a contribution with who recorded it', async () => {
    const { fixture, element } = await setup();

    element.querySelector<HTMLButtonElement>('app-contributions-table .link-button')!.click();
    await settle(fixture);

    const drawer = element.querySelector('app-contribution-detail-drawer')?.textContent ?? '';
    expect(drawer).toContain('Tesorera');
    expect(drawer).toContain('Pendiente de consolidar');
    expect(drawer).toContain('Anular aporte');
  });

  it('shows an error banner with a retry when the list fails', async () => {
    const repository = new FakeRepository();
    repository.failList = true;
    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        { provide: ContributionsRepository, useValue: repository },
        { provide: AuthService, useValue: { can: () => false, tenant: signal({ denominationId: 1, congregationId: 10 }) } },
      ],
    });
    const fixture = TestBed.createComponent(ContributionsPage);
    await settle(fixture);

    expect((fixture.nativeElement as HTMLElement).querySelector('app-error-banner')?.textContent).toContain('No fue posible cargar los aportes');
  });
});
