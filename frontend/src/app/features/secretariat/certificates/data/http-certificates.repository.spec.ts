import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { CertificatesRepository } from './certificates.repository';
import { HttpCertificatesRepository } from './http-certificates.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: CertificatesRepository, useClass: HttpCertificatesRepository },
    ],
  });
  return {
    repo: TestBed.inject(CertificatesRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

const certificateFilter = {
  typeCode: null,
  status: null,
  q: null,
  issuedFrom: null,
  issuedTo: null,
  sort: 'issuedOn:desc',
  page: 1,
  pageSize: 10,
} as const;

describe('HttpCertificatesRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('lists certificates with server pagination and without the empty filters', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(repo.listCertificates(certificateFilter));
    const request = backend.expectOne((req) => req.url === '/api/certificates');

    expect(request.request.method).toBe('GET');
    expect(request.request.params.keys().sort()).toEqual(['page', 'pageSize', 'sort']);
    expect(request.request.params.get('page')).toBe('1');
    expect(request.request.params.get('pageSize')).toBe('10');
    request.flush({ items: [], total: 0, page: 1, pageSize: 10 });
    expect(await result).toEqual({ items: [], total: 0, page: 1, pageSize: 10 });
  });

  it('sends every filter that is set, trimming the search text', async () => {
    const { repo, backend } = setup();

    const result = firstValueFrom(
      repo.listCertificates({
        typeCode: 'BAU',
        status: 'VOIDED',
        q: '  CERT-BAU-2026-0001 ',
        issuedFrom: '2026-01-01',
        issuedTo: '2026-12-31',
        sort: 'issuedOn:asc',
        page: 3,
        pageSize: 10,
      }),
    );
    const request = backend.expectOne((req) => req.url === '/api/certificates');

    expect(
      Object.fromEntries(
        request.request.params.keys().map((key) => [key, request.request.params.get(key)]),
      ),
    ).toEqual({
      typeCode: 'BAU',
      status: 'VOIDED',
      q: 'CERT-BAU-2026-0001',
      issuedFrom: '2026-01-01',
      issuedTo: '2026-12-31',
      sort: 'issuedOn:asc',
      page: '3',
      pageSize: '10',
    });
    request.flush({ items: [], total: 0, page: 3, pageSize: 10 });
    await result;
  });

  it('asks the server for the preview, the issue and the void', async () => {
    const { repo, backend } = setup();
    const command = { memberId: 4, certificateTypeId: 1, notes: null };

    const preview = firstValueFrom(repo.preview(command));
    const previewRequest = backend.expectOne('/api/certificates/preview');
    expect(previewRequest.request.method).toBe('POST');
    expect(previewRequest.request.body).toEqual(command);
    previewRequest.flush({ snapshot: { number: 'CERT-MEM-2026-0001' }, warnings: [] });
    expect((await preview).warnings).toEqual([]);

    const issued = firstValueFrom(repo.issueCertificate(command));
    const issueRequest = backend.expectOne('/api/certificates');
    expect(issueRequest.request.method).toBe('POST');
    expect(issueRequest.request.body).toEqual(command);
    issueRequest.flush({ id: 9, number: 'CERT-MEM-2026-0001' });
    expect((await issued).id).toBe(9);

    const voided = firstValueFrom(repo.voidCertificate({ id: 9, reason: 'Error en el nombre' }));
    const voidRequest = backend.expectOne('/api/certificates/9/void');
    expect(voidRequest.request.method).toBe('POST');
    expect(voidRequest.request.body).toEqual({ reason: 'Error en el nombre' });
    voidRequest.flush({ id: 9, status: 'VOIDED' });
    expect((await voided).status).toBe('VOIDED');
  });

  it('downloads the PDFs and the CSV as blobs', async () => {
    const { repo, backend } = setup();

    const pdf = firstValueFrom(repo.certificatePdf(5));
    const pdfRequest = backend.expectOne('/api/certificates/5/pdf');
    expect(pdfRequest.request.responseType).toBe('blob');
    pdfRequest.flush(new Blob(['%PDF-']));
    expect((await pdf).size).toBe(5);

    const card = firstValueFrom(repo.cardPdf(7));
    const cardRequest = backend.expectOne('/api/membership-cards/7/pdf');
    expect(cardRequest.request.responseType).toBe('blob');
    cardRequest.flush(new Blob(['%PDF-']));
    await card;

    const csv = firstValueFrom(
      repo.exportCertificates({
        typeCode: 'MEM',
        status: null,
        q: null,
        issuedFrom: null,
        issuedTo: null,
        sort: 'issuedOn:desc',
      }),
    );
    const csvRequest = backend.expectOne((req) => req.url === '/api/certificates/export');
    expect(csvRequest.request.responseType).toBe('blob');
    expect(csvRequest.request.params.get('typeCode')).toBe('MEM');
    expect(csvRequest.request.params.has('page')).toBe(false);
    csvRequest.flush(new Blob(['a;b']));
    await csv;
  });

  it('searches members and loads one by id on the certificates endpoints', async () => {
    const { repo, backend } = setup();

    const found = firstValueFrom(repo.searchMembers('  rojas '));
    const search = backend.expectOne((req) => req.url === '/api/certificates/member-options');
    expect(search.request.params.get('q')).toBe('rojas');
    search.flush([{ id: 1, fullName: 'Ana Rojas', documentLabel: 'CC ····8916' }]);
    expect((await found)[0].documentLabel).toBe('CC ····8916');

    const one = firstValueFrom(repo.findMember(12));
    backend.expectOne('/api/certificates/member-options/12').flush({ id: 12 });
    expect((await one).id).toBe(12);
  });

  it('works with the catalog, the issuing context and the summary', async () => {
    const { repo, backend } = setup();

    const types = firstValueFrom(repo.types());
    backend.expectOne('/api/certificate-types').flush([{ id: 1, code: 'MEM' }]);
    expect((await types)[0].code).toBe('MEM');

    const context = firstValueFrom(repo.issuingContext());
    backend.expectOne('/api/certificates/issuing-context').flush({ congregationId: 10 });
    expect((await context).congregationId).toBe(10);

    const summary = firstValueFrom(repo.summary());
    backend.expectOne('/api/certificates/summary').flush({ year: 2026, today: '2026-11-02' });
    expect((await summary).today).toBe('2026-11-02');
  });

  it('lists, issues and voids cards, and searches the candidates on the server', async () => {
    const { repo, backend } = setup();

    const cards = firstValueFrom(
      repo.listCards({ status: 'VALID', q: 'SC-0130', expiringInDays: 30, page: 2, pageSize: 10 }),
    );
    const list = backend.expectOne((req) => req.url === '/api/membership-cards');
    expect(list.request.params.get('status')).toBe('VALID');
    expect(list.request.params.get('q')).toBe('SC-0130');
    expect(list.request.params.get('expiringInDays')).toBe('30');
    expect(list.request.params.get('page')).toBe('2');
    list.flush({ items: [], total: 0, page: 2, pageSize: 10 });
    await cards;

    const candidates = firstValueFrom(repo.cardCandidates({ q: ' ana ', page: 1, pageSize: 8 }));
    const candidateRequest = backend.expectOne(
      (req) => req.url === '/api/membership-cards/candidates',
    );
    expect(candidateRequest.request.params.get('q')).toBe('ana');
    expect(candidateRequest.request.params.get('pageSize')).toBe('8');
    candidateRequest.flush({ items: [], total: 0, page: 1, pageSize: 8 });
    await candidates;

    const body = { memberId: 4, issuedOn: '2026-11-02', expiresOn: '2028-11-02' };
    const issued = firstValueFrom(repo.issueCard(body));
    const issue = backend.expectOne('/api/membership-cards');
    expect(issue.request.method).toBe('POST');
    expect(issue.request.body).toEqual(body);
    issue.flush({ id: 3 });
    await issued;

    const voided = firstValueFrom(repo.voidCard({ id: 3, reason: 'Carné extraviado' }));
    const voidRequest = backend.expectOne('/api/membership-cards/3/void');
    expect(voidRequest.request.body).toEqual({ reason: 'Carné extraviado' });
    voidRequest.flush({ id: 3, status: 'VOIDED' });
    await voided;
  });
});
