import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DomainError } from '../../../../core/errors/domain-error';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import {
  CertificateFilter,
  CertificateListItem,
  CertificatePage,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CertificatesTableComponent } from './certificates-table.component';

function item(overrides: Partial<CertificateListItem> = {}): CertificateListItem {
  return {
    id: 1,
    number: 'CERT-MEM-2026-0001',
    typeCode: 'MEM',
    typeName: 'Certificado de membresía',
    congregationId: 10,
    congregationName: 'Sede Central',
    memberId: 4,
    memberName: 'Ana María Rojas Díaz',
    memberCode: 'SC-0130',
    issuedOn: '2026-11-02',
    expiresOn: null,
    issuedByName: 'Marta Castillo',
    status: 'ISSUED',
    voidReason: null,
    voidedAt: null,
    ...overrides,
  };
}

class FakeRepository extends CertificatesRepository {
  readonly filters: CertificateFilter[] = [];
  readonly voided: Array<{ id: number; reason: string }> = [];
  readonly pdfs: number[] = [];
  pages: CertificatePage = { items: [item()], total: 25, page: 1, pageSize: 10 };
  failing = false;

  override listCertificates(filter: CertificateFilter): Observable<CertificatePage> {
    this.filters.push(filter);
    if (this.failing) {
      return throwError(() => new DomainError('SERVER_ERROR', 'No pudimos leer los certificados.', 500));
    }
    return of({ ...this.pages, page: filter.page });
  }
  override voidCertificate(command: { id: number; reason: string }) {
    this.voided.push(command);
    return of(item({ status: 'VOIDED', voidReason: command.reason }));
  }
  override certificatePdf(id: number) {
    this.pdfs.push(id);
    return of(new Blob(['%PDF-']));
  }
  override exportCertificates() {
    return of(new Blob(['csv']));
  }
  override types = () => of([]);
  override issuingContext = () => of() as never;
  override summary = () => of() as never;
  override searchMembers = () => of([]);
  override findMember = () => of() as never;
  override preview = () => of() as never;
  override getCertificate = () => of() as never;
  override issueCertificate = () => of() as never;
  override listCards = () => of() as never;
  override cardCandidates = () => of() as never;
  override issueCard = () => of() as never;
  override voidCard = () => of() as never;
  override cardPdf = () => of(new Blob());
}

function render(
  options: { congregationId: number | null; canIssue?: boolean } = { congregationId: 10 },
) {
  const repo = new FakeRepository();
  const saved: Array<{ blob: Blob; filename: string }> = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: CertificatesRepository, useValue: repo },
      {
        provide: AuthService,
        useValue: {
          can: () => options.canIssue ?? true,
          tenant: signal({ denominationId: 1, congregationId: options.congregationId }),
        },
      },
      {
        provide: FileDownloadService,
        useValue: { save: (blob: Blob, filename: string) => saved.push({ blob, filename }) },
      },
    ],
  });
  const fixture = TestBed.createComponent(CertificatesTableComponent);
  fixture.componentRef.setInput('types', [{ code: 'MEM', name: 'Certificado de membresía' }]);
  return { fixture, repo, saved, element: fixture.nativeElement as HTMLElement };
}

const buttonByLabel = (element: HTMLElement, label: string) =>
  Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
    button.getAttribute('aria-label')?.startsWith(label),
  );

describe('CertificatesTableComponent', () => {
  beforeAll(() => {
    // The test DOM has no modal dialogs: a minimal stand-in lets the dialog component open and close.
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });
  afterEach(() => vi.useRealTimers());

  it('draws the error banner instead of throwing in the header when the list fails to load', async () => {
    const { fixture, repo, element } = render();
    repo.failing = true;
    await fixture.whenStable();

    expect(element.querySelector('app-error-banner')).not.toBeNull();
    expect(element.textContent).toContain('No pudimos leer los certificados.');
    // The export button in the header stays disabled instead of reading a failed resource.
    const exportButton = element.querySelector<HTMLButtonElement>('app-export-actions button');
    expect(exportButton?.disabled).toBe(true);
  });

  it('asks the server for the first page and shows its rows', async () => {
    const { fixture, repo, element } = render();
    await fixture.whenStable();

    expect(repo.filters[0]).toMatchObject({
      page: 1,
      pageSize: 10,
      status: null,
      typeCode: null,
      q: null,
    });
    expect(element.textContent).toContain('CERT-MEM-2026-0001');
    expect(element.textContent).toContain('Ana María Rojas Díaz');
    expect(element.textContent).toContain('1–10 de 25');
  });

  it('goes back to the first page and sends the filter when the status changes', async () => {
    const { fixture, repo, element } = render();
    await fixture.whenStable();
    Array.from(element.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Siguiente'))!
      .click();
    await fixture.whenStable();
    expect(repo.filters.at(-1)?.page).toBe(2);

    const status = element.querySelector<HTMLSelectElement>('#issued-filter-status')!;
    status.value = 'VOIDED';
    status.dispatchEvent(new Event('change'));
    await fixture.whenStable();

    expect(repo.filters.at(-1)).toMatchObject({ status: 'VOIDED', page: 1 });
  });

  it('waits for the person to stop typing before searching', async () => {
    vi.useFakeTimers();
    const { fixture, repo, element } = render();
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(1);
    fixture.detectChanges();
    const calls = repo.filters.length;
    expect(calls).toBeGreaterThan(0);

    const search = element.querySelector<HTMLInputElement>('#issued-search')!;
    search.value = 'rojas';
    search.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(100);
    fixture.detectChanges();
    expect(repo.filters.length).toBe(calls);

    await vi.advanceTimersByTimeAsync(300);
    fixture.detectChanges();
    await vi.advanceTimersByTimeAsync(1);
    expect(repo.filters.at(-1)?.q).toBe('rojas');
  });

  it('downloads the PDF of a certificate with its number as the file name', async () => {
    const { fixture, repo, saved, element } = render();
    await fixture.whenStable();

    buttonByLabel(element, 'Descargar PDF de CERT-MEM-2026-0001')!.click();
    await fixture.whenStable();

    expect(repo.pdfs).toEqual([1]);
    expect(saved.map((file) => file.filename)).toEqual(['CERT-MEM-2026-0001.pdf']);
  });

  it('exports the filtered list as CSV', async () => {
    const { fixture, saved, element } = render();
    await fixture.whenStable();

    Array.from(element.querySelectorAll('button'))
      .find((button) => button.getAttribute('aria-label') === 'Descargar en CSV')!
      .click();
    await fixture.whenStable();

    expect(saved.map((file) => file.filename)).toEqual(['certificados.csv']);
  });

  it('offers to void only issued certificates, and only inside a sede', async () => {
    const withSede = render();
    withSede.repo.pages = {
      items: [
        item(),
        item({ id: 2, number: 'CERT-MEM-2026-0002', status: 'VOIDED', voidReason: 'Error' }),
      ],
      total: 2,
      page: 1,
      pageSize: 10,
    };
    await withSede.fixture.whenStable();
    expect(buttonByLabel(withSede.element, 'Anular CERT-MEM-2026-0001')).toBeDefined();
    expect(buttonByLabel(withSede.element, 'Anular CERT-MEM-2026-0002')).toBeUndefined();
    expect(withSede.element.textContent).toContain('Motivo: Error');
  });

  it('shows the sede column and hides void when the scope is the whole denomination', async () => {
    TestBed.resetTestingModule();
    const { fixture, element } = render({ congregationId: null });
    await fixture.whenStable();

    expect(
      Array.from(element.querySelectorAll('th')).map((th) => th.textContent?.trim()),
    ).toContain('Sede');
    expect(buttonByLabel(element, 'Anular ')).toBeUndefined();
  });

  it('voids with the reason the person wrote and reloads the list', async () => {
    const { fixture, repo, element } = render();
    await fixture.whenStable();
    const loads = repo.filters.length;

    buttonByLabel(element, 'Anular CERT-MEM-2026-0001')!.click();
    await fixture.whenStable();
    const reason = document.querySelector<HTMLTextAreaElement>('textarea')!;
    reason.value = 'Error en el nombre del miembro';
    reason.dispatchEvent(new Event('input'));
    document.querySelector<HTMLButtonElement>('button.btn--danger[type="submit"]')!.click();
    await fixture.whenStable();

    expect(repo.voided).toEqual([{ id: 1, reason: 'Error en el nombre del miembro' }]);
    expect(repo.filters.length).toBeGreaterThan(loads);
    expect(element.textContent).toContain('quedó anulado');
  });
});
