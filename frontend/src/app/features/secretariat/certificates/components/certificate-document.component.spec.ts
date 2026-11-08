import { TestBed } from '@angular/core/testing';
import { CertificateSnapshot } from '../data/certificates.models';
import { CertificateDocumentComponent } from './certificate-document.component';

const BASE: CertificateSnapshot = {
  number: 'CERT-DON-2026-0001',
  typeCode: 'DON',
  title: 'CERTIFICADO DE DONACIONES',
  denominationName: 'Iglesia Cristiana Monte de Sion',
  legalName: 'Corporación Iglesia Cristiana Monte de Sion',
  taxId: '900.123.456-7',
  congregationName: 'Sede Central',
  locationLine: 'Sede Central · Bogotá, D.C.',
  intro: 'La Tesorería de la Sede Central hace constar',
  body: 'Se certifica que Ana María Rojas Díaz realizó aportes voluntarios.',
  notes: null,
  closing: 'Se expide en Bogotá, D.C., el 8 de noviembre de 2026.',
  pastorName: 'Pastor Daniel Herrera',
  pastorTitle: 'Pastor(a), Sede Central',
  secretaryName: null,
  secretaryTitle: 'Tesorero(a), Sede Central',
  issuedByName: 'Pastor Daniel Herrera',
  memberName: 'Ana María Rojas Díaz',
  memberCode: 'SC-0130',
  donation: {
    fiscalYear: 2025,
    periodFrom: '2025-01-01',
    periodTo: '2025-12-31',
    receipts: 20,
    total: '$1.250.000',
    totalInWords: 'un millón doscientos cincuenta mil pesos colombianos',
    lines: [
      { concept: 'Diezmo', receipts: 12, amount: '$1.000.000' },
      { concept: 'Ofrenda', receipts: 8, amount: '$250.000' },
    ],
  },
};

function render(snapshot: CertificateSnapshot) {
  const fixture = TestBed.createComponent(CertificateDocumentComponent);
  fixture.componentRef.setInput('snapshot', snapshot);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('CertificateDocumentComponent', () => {
  it('shows the donations by concept, with the total, in a table', () => {
    const element = render(BASE);

    const rows = [...element.querySelectorAll('tbody tr')].map((row) =>
      [...row.querySelectorAll('td')].map((cell) => cell.textContent?.trim()),
    );
    expect(rows).toEqual([
      ['Diezmo', '12', '$1.000.000'],
      ['Ofrenda', '8', '$250.000'],
    ]);
    const total = [...element.querySelectorAll('tfoot td')].map((cell) => cell.textContent?.trim());
    expect(total).toEqual(['20', '$1.250.000']);
    expect(element.querySelector('caption')?.textContent).toContain('2025');
  });

  it('leaves the second signature for the treasurer instead of naming the secretary', () => {
    const element = render(BASE);

    expect(element.textContent).toContain('Tesorero(a), Sede Central');
    expect(element.textContent).not.toContain('Secretario(a) de la sede');
  });

  it('draws no table for the other types, and keeps the placeholder name of the secretary', () => {
    const element = render({
      ...BASE,
      typeCode: 'MEM',
      donation: undefined,
      secretaryTitle: 'Secretario(a), Sede Central',
    });

    expect(element.querySelector('table')).toBeNull();
    expect(element.textContent).toContain('Secretario(a) de la sede');
  });
});
