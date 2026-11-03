import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DomainError } from '../../../../core/errors/domain-error';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import { Page } from '../../../../shared/utils/pagination';
import { VoucherDetail, VoucherListItem } from '../data/cash-book.models';
import { CashBookRepository } from '../data/cash-book.repository';
import { VouchersPanelComponent } from './vouchers-panel.component';

const RECEIPT: VoucherListItem = {
  id: 31,
  code: 'REC-2026-00031',
  type: 'REC',
  typeLabel: 'Recibo de aporte',
  number: 31,
  issuedOn: '2026-11-02',
  amount: 90_000,
  status: 'ISSUED',
  voidReason: null,
  movements: 0,
  contributions: 1,
};

class FakeRepository extends CashBookRepository {
  readonly pdfs: number[] = [];
  failPdf = false;

  vouchers(): Observable<Page<VoucherListItem>> {
    return of({ items: [RECEIPT], total: 1, page: 1, pageSize: 15 });
  }
  voucher(): Observable<VoucherDetail> {
    return throwError(() => new Error('not used'));
  }
  voucherPdf(id: number): Observable<Blob> {
    this.pdfs.push(id);
    return this.failPdf
      ? throwError(() => new DomainError('FORBIDDEN', 'No tienes permiso para realizar esta acción.', 403))
      : of(new Blob(['%PDF-']));
  }
  options = () => throwError(() => new Error('not used'));
  view = () => throwError(() => new Error('not used'));
  record = () => throwError(() => new Error('not used'));
  reverse = () => throwError(() => new Error('not used'));
  closePeriod = () => throwError(() => new Error('not used'));
  consolidationPreview = () => throwError(() => new Error('not used'));
  consolidate = () => throwError(() => new Error('not used'));
}

async function render() {
  const repository = new FakeRepository();
  const saved: Array<{ blob: Blob; filename: string }> = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: CashBookRepository, useValue: repository },
      { provide: AuthService, useValue: { tenant: signal({ denominationId: 1, congregationId: 10 }) } },
      { provide: FileDownloadService, useValue: { save: (blob: Blob, filename: string) => saved.push({ blob, filename }) } },
    ],
  });
  const fixture = TestBed.createComponent(VouchersPanelComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, repository, saved, element: fixture.nativeElement as HTMLElement };
}

describe('VouchersPanelComponent: printable vouchers', () => {
  it('downloads the receipt of a row as a PDF named after its code', async () => {
    const { fixture, repository, saved, element } = await render();

    element.querySelector<HTMLButtonElement>('button[aria-label="Descargar el comprobante REC-2026-00031 en PDF"]')!.click();
    await fixture.whenStable();

    expect(repository.pdfs).toEqual([31]);
    expect(saved.map((file) => file.filename)).toEqual(['REC-2026-00031.pdf']);
  });

  it('shows the message of the API when the PDF is refused and does not save anything', async () => {
    const { fixture, repository, saved, element } = await render();
    repository.failPdf = true;

    element.querySelector<HTMLButtonElement>('button[aria-label^="Descargar el comprobante"]')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(element.querySelector('.vouchers__download-error')?.textContent).toContain('No tienes permiso');
    expect(saved).toHaveLength(0);
  });
});
