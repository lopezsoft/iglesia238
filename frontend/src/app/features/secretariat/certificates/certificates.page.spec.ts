import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { Permission } from '../../../core/auth/permission';
import { CertificatesPage } from './certificates.page';
import { IssuingContext } from './data/certificates.models';
import { CertificatesRepository } from './data/certificates.repository';

const context: IssuingContext = {
  congregationId: 10,
  year: 2026,
  today: '2026-11-08',
  letterhead: {
    denominationName: 'Iglesia Cristiana Monte de Sion',
    legalName: 'Iglesia Cristiana Monte de Sion',
    taxId: '900.123.456-7',
    congregationName: 'Sede Central',
    cityName: 'Bogotá, D.C.',
    locationLine: 'Sede Central · Bogotá, D.C.',
  },
  signers: { pastorName: 'Pastor Daniel Herrera', secretaryName: null },
  issuedByName: 'Tesorero',
  types: [
    { id: 9, code: 'DON', name: 'Certificado de donaciones', nextNumber: 'CERT-DON-2026-0001' },
  ],
};

const repository = {
  types: () => of([]),
  issuingContext: () => of(context),
  summary: () =>
    of({
      year: 2026,
      today: '2026-11-08',
      issued: 3,
      voided: 1,
      cardsValid: 7,
      cardsExpiringSoon: 2,
      cardsExpired: 4,
    }),
  findMember: () => of(null),
  searchMembers: () => of([]),
  listCertificates: () => of({ items: [], total: 0, page: 1, pageSize: 10 }),
  listCards: () => of({ items: [], total: 0, page: 1, pageSize: 10 }),
} as unknown as CertificatesRepository;

async function render(...permissions: Permission[]) {
  const granted = new Set<string>(permissions);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: CertificatesRepository, useValue: repository },
      {
        provide: AuthService,
        useValue: {
          can: (permission: string) => granted.has(permission),
          tenant: signal({ denominationId: 1, congregationId: 10 }),
          activeScope: signal({ label: 'Sede Central' }),
        },
      },
    ],
  });
  const fixture = TestBed.createComponent(CertificatesPage);
  fixture.detectChanges();
  await fixture.whenStable();
  await new Promise((resolve) => setTimeout(resolve, 350));
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return { element, text: element.textContent ?? '' };
}

describe('CertificatesPage', () => {
  it('shows the treasury only the donations certificate: no cards, no card figures, and the issue form', async () => {
    const { element, text } = await render('contributions.read', 'donation-certificates.issue');

    expect(text).toContain('Certificados de donaciones');
    expect(text).not.toContain('Carnés de miembro');
    expect(text).not.toContain('Carnés vigentes');
    expect(text).not.toContain('Carnés vencidos');
    expect(text).toContain('Certificados emitidos en 2026');
    expect(element.querySelector('app-certificate-issue')).not.toBeNull();
    expect(text).not.toContain('solo lectura');
  });

  it('keeps the whole module for the general permission: tabs, card figures and the issue form', async () => {
    const { element, text } = await render('certificates.issue');

    expect(text).toContain('Certificados y carnés');
    expect(text).toContain('Carnés de miembro');
    expect(text).toContain('Carnés vigentes');
    expect(element.querySelector('app-certificate-issue')).not.toBeNull();
  });
});
