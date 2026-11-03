import { TestBed } from '@angular/core/testing';
import { TithePreview } from '../data/tithe-settlements.models';
import { TithePreviewComponent } from './tithe-preview.component';

const PREVIEW: TithePreview = {
  from: '2026-10-01',
  to: '2026-10-31',
  congregationName: 'Sede Central',
  denominationName: 'Monte de Sión',
  localFundName: 'Fondo Local',
  count: 2,
  contributorCount: 1,
  anonymousCount: 1,
  excludedCount: 1,
  grossTithe: 1_000_000,
  rule: { id: 1, effectiveFrom: '2026-01-01', nationalShareRate: 0.1, localFundRate: 0.3, inForce: true },
  components: [
    {
      key: 'NATIONAL',
      rate: 0.1,
      amount: 100_000,
      booking: { accountCode: '530505', accountName: 'Cuota de la denominación', fundName: 'Fondo Local' },
    },
    { key: 'LOCAL_FUND', rate: 0.27, amount: 270_000, booking: null },
    { key: 'PASTOR', rate: 0.63, amount: 630_000, booking: null },
  ],
  componentsTotal: 1_000_000,
  contributions: [
    { id: 1, receiptNumber: 'REC-2026-00001', receivedOn: '2026-10-05', contributorName: 'Ana Pérez', memberCode: 'SC-0130', paymentMethod: 'CASH', amount: 600_000 },
    { id: 2, receiptNumber: null, receivedOn: '2026-10-06', contributorName: null, memberCode: null, paymentMethod: 'BANK_TRANSFER', amount: 400_000 },
  ],
  nextNumber: 'LD-2026-00001',
};

function render(preview: TithePreview = PREVIEW) {
  const fixture = TestBed.createComponent(TithePreviewComponent);
  fixture.componentRef.setInput('preview', preview);
  fixture.componentRef.setInput('canConfirm', true);
  fixture.detectChanges();
  return { fixture, element: fixture.nativeElement as HTMLElement };
}

describe('TithePreviewComponent', () => {
  it('shows each component with its percentage, destination and where it is booked', () => {
    const { element } = render();
    const rows = Array.from(element.querySelectorAll('tbody tr')).slice(0, 3);

    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('Participación nacional');
    expect(rows[0].textContent).toContain('Monte de Sión');
    expect(rows[0].textContent).toContain('530505 · Cuota de la denominación (Fondo Local)');
    expect(rows[1].textContent).toContain('30 % del neto (27 % del bruto)');
    expect(rows[1].textContent).toContain('Se queda en el fondo local');
    expect(rows[2].textContent).toContain('Pastor de Sede Central');
  });

  it('warns that the pastoral allocation will not touch the cash book when its account is missing', () => {
    const { element } = render();

    expect(element.textContent).toContain('Sin movimiento de caja: asignación pastoral');
  });

  it('confirms the draft and can discard it', () => {
    const { fixture, element } = render();
    const confirm = vi.fn();
    const discard = vi.fn();
    fixture.componentInstance.confirm.subscribe(confirm);
    fixture.componentInstance.discard.subscribe(discard);

    const buttons = Array.from(element.querySelectorAll<HTMLButtonElement>('.confirm button, .card__footer button'));
    buttons.find((button) => button.textContent?.includes('Confirmar liquidación'))?.click();
    buttons.find((button) => button.textContent?.includes('Descartar'))?.click();

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(discard).toHaveBeenCalledTimes(1);
  });

  it('cannot confirm an empty draft', () => {
    const { element } = render({ ...PREVIEW, count: 0, grossTithe: 0, componentsTotal: 0, contributions: [] });
    const confirm = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find((button) =>
      button.textContent?.includes('Confirmar liquidación'),
    );

    expect(element.textContent).toContain('No hay diezmos por liquidar en el rango');
    expect(confirm?.disabled).toBe(true);
  });
});
