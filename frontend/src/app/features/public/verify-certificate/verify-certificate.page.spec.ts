import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../../core/errors/domain-error';
import { CertificateVerification } from './data/certificate-verification.models';
import { CertificateVerificationRepository } from './data/certificate-verification.repository';
import { VerifyCertificatePage } from './verify-certificate.page';

const VALID: CertificateVerification = {
  status: 'VALID',
  number: 'CERT-MEM-2026-0031',
  title: 'CERTIFICADO DE MEMBRESÍA',
  denominationName: 'Iglesia Cristiana Monte de Sion',
  congregationName: 'Sede Central',
  holderName: 'Ana M. R. D.',
  issuedOn: '2026-11-02',
  expiresOn: null,
  verifiedOn: '2026-11-08',
};

class FakeRepository extends CertificateVerificationRepository {
  readonly tokens: string[] = [];
  response: Observable<CertificateVerification> = of(VALID);

  verify(token: string): Observable<CertificateVerification> {
    this.tokens.push(token);
    return this.response;
  }
}

async function render(query: Record<string, string>, repository = new FakeRepository()) {
  TestBed.configureTestingModule({
    providers: [
      { provide: CertificateVerificationRepository, useValue: repository },
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(query) } },
      },
    ],
  });
  const fixture = TestBed.createComponent(VerifyCertificatePage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, repository, text: (fixture.nativeElement as HTMLElement).textContent ?? '' };
}

describe('VerifyCertificatePage', () => {
  it('verifies the token of the link and shows an authentic, valid document', async () => {
    const { repository, text } = await render({ t: '42.AbCdEfGhIjKlMnOpQrStUv' });

    expect(repository.tokens).toEqual(['42.AbCdEfGhIjKlMnOpQrStUv']);
    expect(text).toContain('Documento auténtico y vigente');
    expect(text).toContain('CERT-MEM-2026-0031');
    expect(text).toContain('Ana M. R. D.');
  });

  it('shows a voided document as such', async () => {
    const repository = new FakeRepository();
    repository.response = of({ ...VALID, status: 'VOIDED' });

    const { text } = await render({ t: '42.AbCdEfGhIjKlMnOpQrStUv' }, repository);

    expect(text).toContain('Documento anulado');
  });

  it('shows an expired document with its expiry date', async () => {
    const repository = new FakeRepository();
    repository.response = of({ ...VALID, status: 'EXPIRED', expiresOn: '2026-11-01' });

    const { text } = await render({ t: '42.AbCdEfGhIjKlMnOpQrStUv' }, repository);

    expect(text).toContain('vencido');
    expect(text).toContain('01/11/2026');
  });

  it('shows the message of the API when the document cannot be verified', async () => {
    const repository = new FakeRepository();
    repository.response = throwError(
      () =>
        new DomainError('CERTIFICATE_NOT_VERIFIABLE', 'No pudimos verificar este documento.', 404),
    );

    const { text } = await render({ t: '42.AbCdEfGhIjKlMnOpQrStUv' }, repository);

    expect(text).toContain('No pudimos verificar este documento.');
  });

  it('does not call the API when the link has no token', async () => {
    const { repository, text } = await render({});

    expect(repository.tokens).toEqual([]);
    expect(text).toContain('El enlace está incompleto');
  });
});
