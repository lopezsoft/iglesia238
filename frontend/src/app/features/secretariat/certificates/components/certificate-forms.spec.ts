import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Observable, of } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import {
  CardCandidatePage,
  CardCandidateQuery,
  CardListItem,
  CertificateListItem,
  CertificatePreview,
  CertificateSnapshot,
  IssueCardCommand,
  IssueCertificateCommand,
  IssuingContext,
  MemberOption,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CardIssueDialogComponent } from './card-issue-dialog.component';
import { CertificateIssueComponent } from './certificate-issue.component';

const snapshot: CertificateSnapshot = {
  number: 'CERT-MEM-2026-0003',
  typeCode: 'MEM',
  title: 'CERTIFICADO DE MEMBRESÍA',
  denominationName: 'Iglesia Cristiana Monte de Sion',
  legalName: 'Iglesia Cristiana Monte de Sion',
  taxId: '900.123.456-7',
  congregationName: 'Sede Central',
  locationLine: 'Sede Central · Bogotá, D.C.',
  intro: 'La Secretaría de la Sede Central hace constar',
  body: 'Se certifica que Ana María Rojas Díaz es miembro activo(a).',
  notes: null,
  closing: 'Se expide en Bogotá, D.C., el 2 de noviembre de 2026.',
  pastorName: 'Pastor Daniel Herrera',
  pastorTitle: 'Pastor(a), Sede Central',
  secretaryName: 'Marta Castillo',
  secretaryTitle: 'Secretario(a), Sede Central',
  issuedByName: 'Marta Castillo',
  memberName: 'Ana María Rojas Díaz',
  memberCode: 'SC-0130',
};

const member: MemberOption = {
  id: 4,
  fullName: 'Ana María Rojas Díaz',
  code: 'SC-0130',
  documentLabel: 'CC ····8916',
  joinedOn: '2008-04-10',
  isBaptized: false,
  waterBaptismOn: null,
};

const context: IssuingContext = {
  congregationId: 10,
  year: 2026,
  today: '2026-11-02',
  letterhead: {
    denominationName: 'Iglesia Cristiana Monte de Sion',
    legalName: 'Iglesia Cristiana Monte de Sion',
    taxId: '900.123.456-7',
    congregationName: 'Sede Central',
    cityName: 'Bogotá, D.C.',
    locationLine: 'Sede Central · Bogotá, D.C.',
  },
  signers: { pastorName: 'Pastor Daniel Herrera', secretaryName: 'Marta Castillo' },
  issuedByName: 'Marta Castillo',
  types: [
    { id: 1, code: 'MEM', name: 'Certificado de membresía', nextNumber: 'CERT-MEM-2026-0003' },
    { id: 3, code: 'BAU', name: 'Certificado de bautismo', nextNumber: 'CERT-BAU-2026-0001' },
    { id: 9, code: 'DON', name: 'Certificado de donaciones', nextNumber: 'CERT-DON-2026-0001' },
  ],
};

class FakeRepository extends CertificatesRepository {
  readonly previews: IssueCertificateCommand[] = [];
  readonly issued: IssueCertificateCommand[] = [];
  readonly candidateQueries: CardCandidateQuery[] = [];
  readonly cardsIssued: IssueCardCommand[] = [];

  override preview(command: IssueCertificateCommand): Observable<CertificatePreview> {
    this.previews.push(command);
    return of({ snapshot, warnings: ['La sede no tiene un pastor vigente.'] });
  }
  override issueCertificate(command: IssueCertificateCommand): Observable<CertificateListItem> {
    this.issued.push(command);
    return of({
      number: 'CERT-MEM-2026-0003',
      memberName: 'Ana María Rojas Díaz',
    } as CertificateListItem);
  }
  override cardCandidates(query: CardCandidateQuery): Observable<CardCandidatePage> {
    this.candidateQueries.push(query);
    return of({
      items: [
        {
          memberId: 4,
          fullName: 'Ana María Rojas Díaz',
          cardNumber: 'SC-0130',
          hasExpiredCard: true,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 8,
    });
  }
  override issueCard(command: IssueCardCommand) {
    this.cardsIssued.push(command);
    return of({
      id: 1,
      cardNumber: 'SC-0130',
      memberName: 'Ana',
      expiresOn: command.expiresOn,
    } as CardListItem);
  }
  override types = () => of([]);
  override issuingContext = () => of(context);
  override summary = () => of() as never;
  override searchMembers = () => of([member]);
  override findMember = () => of(member);
  override listCertificates = () => of() as never;
  override getCertificate = () => of() as never;
  override voidCertificate = () => of() as never;
  override certificatePdf = () => of(new Blob());
  override exportCertificates = () => of(new Blob());
  override listCards = () => of() as never;
  override voidCard = () => of() as never;
  override cardPdf = () => of(new Blob());
}

describe('CertificateIssueComponent', () => {
  function render(preselected: MemberOption | null) {
    const repo = new FakeRepository();
    TestBed.configureTestingModule({
      providers: [
        { provide: CertificatesRepository, useValue: repo },
        // The member search inside the form reads the tenant of the session.
        {
          provide: AuthService,
          useValue: { tenant: signal({ denominationId: 1, congregationId: 10 }) },
        },
      ],
    });
    const fixture = TestBed.createComponent(CertificateIssueComponent);
    fixture.componentRef.setInput('context', context);
    fixture.componentRef.setInput('preselectedMember', preselected);
    return { fixture, repo, element: fixture.nativeElement as HTMLElement };
  }

  it('invites to pick a member before showing a preview', async () => {
    const { fixture, repo, element } = render(null);
    await fixture.whenStable();

    expect(repo.previews).toEqual([]);
    expect(element.textContent).toContain('Selecciona un miembro y un tipo de certificado');
  });

  it('shows the preview the server printed, with its warnings', async () => {
    const { fixture, repo, element } = render({ ...member, isBaptized: true });
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();

    expect(repo.previews).toEqual([{ memberId: 4, certificateTypeId: 1, notes: null }]);
    expect(element.textContent).toContain('CERTIFICADO DE MEMBRESÍA');
    expect(element.textContent).toContain('La sede no tiene un pastor vigente.');
  });

  it('does not ask for the baptism certificate of a member without baptism', async () => {
    const { fixture, repo, element } = render(member);
    fixture.componentInstance['form'].controls.certificateTypeId.setValue(3);
    await new Promise((resolve) => setTimeout(resolve, 350));
    await fixture.whenStable();

    expect(element.textContent).toContain('no tiene bautismo registrado');
    expect(repo.previews.filter((command) => command.certificateTypeId === 3)).toEqual([]);
    expect((element.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(
      false,
    );
  });

  it('issues with the selected member and trimmed notes, then reports the number', async () => {
    const { fixture, repo, element } = render({ ...member, isBaptized: true });
    fixture.componentInstance['form'].controls.notes.setValue('  Para visa  ');
    await fixture.whenStable();

    (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
    await fixture.whenStable();

    expect(repo.issued).toEqual([{ memberId: 4, certificateTypeId: 1, notes: 'Para visa' }]);
    expect(element.textContent).toContain(
      'Certificado CERT-MEM-2026-0003 emitido para Ana María Rojas Díaz.',
    );
  });

  describe('donations certificate', () => {
    const yearSelect = (element: HTMLElement) =>
      element.querySelector<HTMLSelectElement>('#cert-fiscal-year');

    it('does not ask for a year, nor send one, for the other types', async () => {
      const { fixture, repo, element } = render({ ...member, isBaptized: true });
      await new Promise((resolve) => setTimeout(resolve, 350));
      await fixture.whenStable();

      expect(yearSelect(element)).toBeNull();
      expect(repo.previews.every((command) => !('fiscalYear' in command))).toBe(true);
    });

    it('asks for the year, offers the last six and defaults to the previous one', async () => {
      const { fixture, repo, element } = render({ ...member, isBaptized: true });
      fixture.componentInstance['form'].controls.certificateTypeId.setValue(9);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await fixture.whenStable();
      fixture.detectChanges();

      const options = [...(yearSelect(element)?.options ?? [])].map((option) => option.text.trim());
      expect(options).toEqual(['2026', '2025', '2024', '2023', '2022', '2021']);
      expect(repo.previews.at(-1)).toEqual({
        memberId: 4,
        certificateTypeId: 9,
        notes: null,
        fiscalYear: 2025,
      });
    });

    it('previews and issues with the year the person picks', async () => {
      const { fixture, repo, element } = render({ ...member, isBaptized: true });
      fixture.componentInstance['form'].controls.certificateTypeId.setValue(9);
      fixture.componentInstance['form'].controls.fiscalYear.setValue(2024);
      await new Promise((resolve) => setTimeout(resolve, 350));
      await fixture.whenStable();

      expect(repo.previews.at(-1)?.fiscalYear).toBe(2024);

      (element.querySelector('button[type="submit"]') as HTMLButtonElement).click();
      await fixture.whenStable();

      expect(repo.issued).toEqual([
        { memberId: 4, certificateTypeId: 9, notes: null, fiscalYear: 2024 },
      ]);
    });
  });
});

describe('CardIssueDialogComponent', () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close ??= function close(this: HTMLDialogElement) {
      this.removeAttribute('open');
      this.dispatchEvent(new Event('close'));
    };
  });

  it('searches the candidates on the server, prefills two years of validity and issues the card', async () => {
    const repo = new FakeRepository();
    TestBed.configureTestingModule({
      providers: [{ provide: CertificatesRepository, useValue: repo }],
    });
    const fixture = TestBed.createComponent(CardIssueDialogComponent);
    fixture.componentRef.setInput('today', '2026-11-02');
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    expect(repo.candidateQueries[0]).toEqual({ q: null, page: 1, pageSize: 8 });
    expect((element.querySelector('#card-issued-on') as HTMLInputElement).value).toBe('2026-11-02');
    expect((element.querySelector('#card-expires-on') as HTMLInputElement).value).toBe(
      '2028-11-02',
    );

    element.querySelector<HTMLButtonElement>('.candidate-list button')!.click();
    await fixture.whenStable();
    expect(element.textContent).toContain('Se asignará el número');
    expect(element.textContent).toContain('tenía un carné vencido');

    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(repo.cardsIssued).toEqual([
      { memberId: 4, issuedOn: '2026-11-02', expiresOn: '2028-11-02' },
    ]);
  });

  it('does not issue without a member', async () => {
    const repo = new FakeRepository();
    TestBed.configureTestingModule({
      providers: [{ provide: CertificatesRepository, useValue: repo }],
    });
    const fixture = TestBed.createComponent(CardIssueDialogComponent);
    fixture.componentRef.setInput('today', '2026-11-02');
    fixture.componentRef.setInput('open', true);
    await fixture.whenStable();
    const element = fixture.nativeElement as HTMLElement;

    element.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await fixture.whenStable();

    expect(repo.cardsIssued).toEqual([]);
    expect(element.textContent).toContain('Selecciona el miembro que recibe el carné.');
  });
});
