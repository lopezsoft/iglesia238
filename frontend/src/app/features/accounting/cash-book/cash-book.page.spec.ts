import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError } from '../../../core/errors/domain-error';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import { Page } from '../../../shared/utils/pagination';
import { ExportedFile } from '../data/accounting-http';
import { CashBookPage } from './cash-book.page';
import {
  CashBookOptions,
  CashBookReportFormat,
  CashBookQuery,
  CashBookRow,
  CashBookView,
  CashMovementReceipt,
  CashPeriodOption,
  ConsolidationPreview,
  ConsolidationResult,
  VoucherDetail,
  VoucherListItem,
  VoucherQuery,
} from './data/cash-book.models';
import { CashBookRepository } from './data/cash-book.repository';

const NOVEMBER: CashPeriodOption = {
  id: 11,
  year: 2026,
  month: 11,
  status: 'OPEN',
  label: 'Noviembre 2026',
  closedAt: null,
  from: '2026-11-01',
  to: '2026-11-30',
};

function row(id: number, balance: number): CashBookRow {
  return {
    id,
    postedOn: '2026-11-02',
    voucherCode: `CE-2026-0000${id}`,
    accountCode: '510505',
    accountName: 'Servicios públicos',
    description: `Pago ${id}`,
    direction: 'OUT',
    amount: 100,
    balance,
    status: 'POSTED',
    relatedVoucherCode: null,
    reversalBlock: null,
  };
}

const OPTIONS: CashBookOptions = {
  today: '2026-11-02',
  congregationId: 10,
  congregationName: 'Sede Central',
  funds: [{ id: 1, name: 'Fondo Local', isActive: true }],
  periods: [NOVEMBER],
  accounts: [{ id: 4, code: '510505', name: 'Servicios públicos', nature: 'EXPENSE' }],
};

function view(query: CashBookQuery): CashBookView {
  return {
    fundId: 1,
    fundName: 'Fondo Local',
    fundIsActive: true,
    period: NOVEMBER,
    opening: 1000,
    income: 0,
    expense: 200,
    closing: 800,
    inCount: 0,
    outCount: 2,
    rows: [row(1, 900), row(2, 800)],
    totalRows: 31,
    page: query.page ?? 1,
    pageSize: query.pageSize ?? 15,
    pendingToday: { date: '2026-11-02', count: 0, amount: 0 },
    closeBlockedReason: 'Noviembre 2026 aún no termina.',
    nextCashIn: 'CI-2026-00001',
    nextCashOut: 'CE-2026-00003',
    openRange: { min: '2026-11-01', max: '2026-11-02' },
  };
}

class FakeRepository extends CashBookRepository {
  readonly queries: CashBookQuery[] = [];
  options$: Observable<CashBookOptions> = of(OPTIONS);

  options(): Observable<CashBookOptions> {
    return this.options$;
  }
  viewCalls = 0;
  override view(query: CashBookQuery): Observable<CashBookView> {
    this.viewCalls += 1;
    this.queries.push(query);
    return of(view(query));
  }
  record(): Observable<CashMovementReceipt> {
    throw new Error('not used');
  }
  reverse(): Observable<CashMovementReceipt> {
    throw new Error('not used');
  }
  closePeriod(): Observable<CashPeriodOption> {
    throw new Error('not used');
  }
  consolidationPreview(): Observable<ConsolidationPreview> {
    throw new Error('not used');
  }
  consolidate(): Observable<ConsolidationResult> {
    throw new Error('not used');
  }
  vouchers(_query: VoucherQuery): Observable<Page<VoucherListItem>> {
    return of({ items: [], total: 0, page: 1, pageSize: 15 });
  }
  voucher(): Observable<VoucherDetail> {
    throw new Error('not used');
  }
  voucherPdf(): Observable<Blob> {
    throw new Error('not used');
  }
  readonly reports: Array<{ format: string; fundId: number; periodId: number }> = [];
  report$: Observable<ExportedFile> = of({ blob: new Blob(['x']), filename: 'libro-de-caja-2026-11-fondo-local.pdf' });
  override report(format: CashBookReportFormat, fundId: number, periodId: number): Observable<ExportedFile> {
    this.reports.push({ format, fundId, periodId });
    return this.report$;
  }
}

async function render(repository = new FakeRepository()) {
  const auth = {
    can: () => true,
    tenant: signal({ denominationId: 1, congregationId: 10 }),
  };
  const saved: Array<{ blob: Blob; filename: string }> = [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CashBookRepository, useValue: repository },
      { provide: AuthService, useValue: auth },
      { provide: FileDownloadService, useValue: { save: (blob: Blob, filename: string) => saved.push({ blob, filename }) } },
    ],
  });
  const fixture = TestBed.createComponent(CashBookPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement, repository, saved };
}

function exportButton(element: HTMLElement, label: string): HTMLButtonElement {
  return [...element.querySelectorAll<HTMLButtonElement>('app-export-actions button')].find((b) => b.textContent?.trim() === label)!;
}

describe('CashBookPage', () => {
  it('asks the server for the first page of the open period of the first fund', async () => {
    const { repository, element } = await render();

    expect(repository.queries[0]).toEqual({
      fundId: 1,
      periodId: 11,
      page: 1,
      pageSize: 15,
      direction: undefined,
      accountId: undefined,
      search: undefined,
    });
    expect(element.textContent).toContain('Movimientos · Fondo Local · Noviembre 2026');
    expect(element.textContent).toContain('Pago 1');
    expect(element.textContent).toContain('Saldo inicial del periodo');
  });

  it('shows the server paging total and goes to the next page asking the server', async () => {
    const { fixture, repository, element } = await render();

    expect(element.textContent).toContain('1–15 de 31');
    const next = [...element.querySelectorAll<HTMLButtonElement>('app-pagination button')].find((b) => b.textContent?.includes('Siguiente'));
    next!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(repository.queries.at(-1)?.page).toBe(2);
  });

  it('filters by direction on the server and goes back to the first page', async () => {
    const { fixture, repository, element } = await render();
    const out = [...element.querySelectorAll<HTMLButtonElement>('app-segmented-control button')].find((b) => b.textContent?.trim() === 'Salidas');

    out!.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(repository.queries.at(-1)).toMatchObject({ direction: 'OUT', page: 1 });
    // The opening row only makes sense in the unfiltered book.
    expect(element.textContent).not.toContain('Saldo inicial del periodo');
  });

  it('downloads the whole month of the selected fund as a PDF, ignoring the page and the filters on screen', async () => {
    const { fixture, repository, saved, element } = await render();
    element.querySelectorAll<HTMLButtonElement>('app-segmented-control button').forEach((b) => b.textContent?.trim() === 'Salidas' && b.click());
    fixture.detectChanges();
    await fixture.whenStable();

    exportButton(element, 'PDF').click();
    fixture.detectChanges();

    expect(repository.reports).toEqual([{ format: 'pdf', fundId: 1, periodId: 11 }]);
    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toBe('libro-de-caja-2026-11-fondo-local.pdf');
  });

  it('downloads the month as a CSV too', async () => {
    const { fixture, repository, element } = await render();

    exportButton(element, 'CSV').click();
    fixture.detectChanges();

    expect(repository.reports).toEqual([{ format: 'csv', fundId: 1, periodId: 11 }]);
  });

  it('says why the report failed (a month too big, for instance) and lets the user try again', async () => {
    const repository = new FakeRepository();
    repository.report$ = throwError(
      () => new DomainError('CASH_BOOK_REPORT_TOO_LARGE', 'El libro de este mes es demasiado grande para un solo informe.', 422),
    );
    const { fixture, saved, element } = await render(repository);

    exportButton(element, 'PDF').click();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('demasiado grande');
    expect(saved).toHaveLength(0);
    expect(exportButton(element, 'PDF').disabled).toBe(false);
  });

  it('explains how to open the first period when the sede has none', async () => {
    const repository = new FakeRepository();
    repository.options$ = of({ ...OPTIONS, periods: [] });

    const { element } = await render(repository);

    expect(element.textContent).toContain('Esta sede aún no tiene periodos contables');
    expect(element.querySelector('a[href="/accounting/setup"]')).not.toBeNull();
    expect(repository.viewCalls).toBe(0);
  });

  it('asks for a sede when the session covers the whole denomination', async () => {
    const repository = new FakeRepository();
    repository.options$ = of({ ...OPTIONS, congregationId: null, periods: [] });

    const { element } = await render(repository);

    expect(element.textContent).toContain('Selecciona una sede');
  });

  it('lays the balance cards out in the shared KPI grid, like every other screen', async () => {
    const { element } = await render();

    expect(element.querySelectorAll('.kpi-grid app-stat-card')).toHaveLength(4);
    expect(element.querySelector('.grid-auto')).toBeNull();
  });

  it('draws the error banner with a retry, not a blank page, when the options fail', async () => {
    const repository = new FakeRepository();
    repository.options$ = throwError(() => new DomainError('SERVER_ERROR', 'El servidor no pudo completar la operación.', 500));

    const { element } = await render(repository);

    expect(element.querySelector('app-error-banner')).not.toBeNull();
    expect(element.textContent).toContain('El servidor no pudo completar la operación.');
    // The header still renders with its fallback text.
    expect(element.querySelector('h1')?.textContent).toContain('Libro de caja');
    expect(repository.viewCalls).toBe(0);
  });

  it('draws the error banner of the book when only the movements fail', async () => {
    const repository = new FakeRepository();
    repository.view = () => throwError(() => new DomainError('SERVER_ERROR', 'No pudimos leer el libro.', 500));

    const { element } = await render(repository);

    expect(element.querySelector('app-error-banner')).not.toBeNull();
    expect(element.querySelector('table')).toBeNull();
  });
});
