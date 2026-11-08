import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../../core/errors/domain-error';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import { ExportedFile } from '../../data/accounting-http';
import { polyfillDialog } from '../../../membership/members/data/members-testing';
import { TitheSettlementDetail, TitheSettlementRow } from '../data/tithe-settlements.models';
import { TitheSettlementsRepository } from '../data/tithe-settlements.repository';
import { SettlementDetailDialogComponent } from './settlement-detail-dialog.component';

const ROW: TitheSettlementRow = {
  id: 7,
  number: 'LD-2026-00007',
  coveredFrom: '2026-11-01',
  coveredTo: '2026-11-07',
  settledOn: '2026-11-08',
  grossTithe: 1_000_000,
  nationalShare: 100_000,
  localFundShare: 200_000,
  pastorNet: 700_000,
  nationalShareRate: 0.1,
  localFundRate: 0.2,
  contributionCount: 0,
  status: 'ISSUED',
  voidReason: null,
  voidedAt: null,
};

const DETAIL: TitheSettlementDetail = {
  ...ROW,
  congregationName: 'Sede Central',
  voidedByName: null,
  contributions: [],
  cashLines: [],
};

class FakeRepository extends TitheSettlementsRepository {
  readonly acts: number[] = [];
  actResult: Observable<ExportedFile> = of({ blob: new Blob(['%PDF-']), filename: 'acta-liquidacion-ld-2026-00007.pdf' });

  override detail(): Observable<TitheSettlementDetail> {
    return of(DETAIL);
  }
  override reportPdf(settlementId: number): Observable<ExportedFile> {
    this.acts.push(settlementId);
    return this.actResult;
  }
  overview = () => throwError(() => new Error('not used'));
  preview = () => throwError(() => new Error('not used'));
  confirm = () => throwError(() => new Error('not used'));
  void = () => throwError(() => new Error('not used'));
  list = () => throwError(() => new Error('not used'));
}

async function render(repository = new FakeRepository()) {
  const saved: Array<{ blob: Blob; filename: string }> = [];
  TestBed.configureTestingModule({
    providers: [
      { provide: TitheSettlementsRepository, useValue: repository },
      { provide: FileDownloadService, useValue: { save: (blob: Blob, filename: string) => saved.push({ blob, filename }) } },
    ],
  });
  const fixture = TestBed.createComponent(SettlementDetailDialogComponent);
  fixture.componentRef.setInput('settlement', ROW);
  fixture.componentRef.setInput('open', true);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  const button = () =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.includes('Descargar acta'))!;
  return { fixture, element, repository, saved, button };
}

describe('SettlementDetailDialogComponent: the act', () => {
  beforeAll(polyfillDialog);

  it('downloads the act of the settlement as a PDF with the name the API proposes', async () => {
    const { fixture, repository, saved, button } = await render();

    button().click();
    fixture.detectChanges();

    expect(repository.acts).toEqual([7]);
    expect(saved).toHaveLength(1);
    expect(saved[0].filename).toBe('acta-liquidacion-ld-2026-00007.pdf');
  });

  it('shows why the act could not be printed and lets the user try again', async () => {
    const repository = new FakeRepository();
    repository.actResult = throwError(() => new DomainError('SERVER_ERROR', 'No pudimos generar el acta.', 500));
    const { fixture, element, saved, button } = await render(repository);

    button().click();
    fixture.detectChanges();

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('No pudimos generar el acta.');
    expect(saved).toHaveLength(0);
    expect(button().disabled).toBe(false);
  });
});
