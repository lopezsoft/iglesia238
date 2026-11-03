import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import {
  ASSIGNMENTS_READER,
  AssignmentsReader,
  UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { buildCertificateSnapshot } from '../src/modules/certificates/application/certificate-document.js';
import type {
  CardRecord,
  CertificateRecord,
} from '../src/modules/certificates/application/certificate.models.js';
import { CERTIFICATE_REPOSITORY } from '../src/modules/certificates/application/ports/certificate.repository.js';
import { MEMBERSHIP_CARD_REPOSITORY } from '../src/modules/certificates/application/ports/membership-card.repository.js';

const SECRETARY = 1;
const TREASURER = 2;

const access = new Map<number, UserAccess>([
  [
    SECRETARY,
    {
      userId: SECRETARY,
      isActive: true,
      assignments: [
        {
          roleCode: 'SECRETARY',
          kind: 'CONGREGATION',
          scopeKey: 'C:10',
          denominationId: 1,
          congregationId: 10,
          permissions: ['certificates.issue'],
        },
      ],
    },
  ],
  [
    TREASURER,
    {
      userId: TREASURER,
      isActive: true,
      assignments: [
        {
          roleCode: 'TREASURER',
          kind: 'CONGREGATION',
          scopeKey: 'C:10',
          denominationId: 1,
          congregationId: 10,
          permissions: ['contributions.read'],
        },
      ],
    },
  ],
]);

const reader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(access.get(userId) ?? null),
  findCongregationDenominationId: (id) =>
    Promise.resolve(id === 10 ? 1 : id === 20 ? 2 : null),
};

const snapshot = buildCertificateSnapshot({
  number: 'CERT-MEM-2026-0031',
  typeCode: 'MEM',
  typeName: 'Certificado de membresía',
  template: null,
  issuedOn: '2026-11-02',
  letterhead: {
    denominationName: 'Iglesia Cristiana Monte de Sion',
    legalName: 'Iglesia Cristiana Monte de Sion',
    taxId: '900.123.456-7',
    congregationName: 'Sede Central',
    cityName: 'Bogotá, D.C.',
    locationLine: 'Sede Central · Bogotá, D.C.',
  },
  pastorName: 'Pastor Daniel Herrera',
  secretaryName: 'Marta Castillo',
  issuedByName: 'Marta Castillo',
  member: {
    fullName: 'Ana María Rojas Díaz',
    code: 'SC-0130',
    documentLabel: 'CC 52.418.916',
    joinedOn: null,
    waterBaptismOn: null,
  },
  notes: null,
});

const certificate: CertificateRecord = {
  id: 5,
  congregationId: 10,
  congregationName: 'Sede Central',
  typeId: 1,
  typeCode: 'MEM',
  typeName: 'Certificado de membresía',
  memberId: 1,
  sequenceNumber: 31,
  issuedOn: '2026-11-02',
  expiresOn: null,
  issuedByName: 'Marta Castillo',
  snapshot,
  voidedAt: null,
  voidReason: null,
};

const card: CardRecord = {
  id: 9,
  memberId: 1,
  memberName: 'Ana María Rojas Díaz',
  congregationId: 10,
  congregationCode: 'SC',
  congregationName: 'Sede Central',
  denominationName: 'Iglesia Cristiana Monte de Sion',
  memberNumber: 130,
  issuedOn: '2026-11-02',
  expiresOn: '2028-11-02',
  voidedAt: null,
  voidReason: null,
};

// Only the rows of denomination 1, congregation 10 exist: anything else answers 404.
const certificateRepository = {
  findById: vi.fn(
    (
      scope: { denominationId: number; congregationId: number | null },
      id: number,
    ) =>
      Promise.resolve(
        scope.denominationId === 1 &&
          (scope.congregationId === null || scope.congregationId === 10) &&
          id === certificate.id
          ? certificate
          : null,
      ),
  ),
  listForExport: vi.fn(() => Promise.resolve([certificate])),
};
const cardRepository = {
  findById: vi.fn(
    (
      scope: { denominationId: number; congregationId: number | null },
      id: number,
    ) =>
      Promise.resolve(
        scope.denominationId === 1 &&
          (scope.congregationId === null || scope.congregationId === 10) &&
          id === card.id
          ? card
          : null,
      ),
  ),
};

describe('Certificates and cards API', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;

  const request = async (
    method: 'GET' | 'POST',
    url: string,
    options: { user?: number; scope?: string; body?: object } = {},
  ) =>
    app.inject({
      method,
      url,
      payload: options.body,
      headers: {
        ...(options.user === undefined
          ? {}
          : {
              authorization: `Bearer ${(await tokens.sign({ userId: options.user, sessionId: 's' })).token}`,
            }),
        ...(options.scope === undefined ? {} : { 'x-scope': options.scope }),
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({ isActive: () => Promise.resolve(true) })
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(reader)
      .overrideProvider(CERTIFICATE_REPOSITORY)
      .useValue(certificateRepository)
      .overrideProvider(MEMBERSHIP_CARD_REPOSITORY)
      .useValue(cardRepository)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    tokens = app.get(AccessTokenService);
  });

  afterAll(async () => {
    await app.close();
  });

  it.each([
    ['/api/certificates'],
    ['/api/certificates/5/pdf'],
    ['/api/certificate-types'],
    ['/api/membership-cards'],
    ['/api/membership-cards/9/pdf'],
  ])('requires authentication: GET %s', async (url) => {
    const response = await request('GET', url, { scope: 'C:10' });

    expect(response.statusCode).toBe(401);
  });

  it('requires the certificates.issue permission', async () => {
    const response = await request('GET', '/api/certificates', {
      user: TREASURER,
      scope: 'C:10',
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires the X-Scope header', async () => {
    const response = await request('GET', '/api/certificates', {
      user: SECRETARY,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SCOPE_REQUIRED' });
  });

  it('rejects a scope the user does not hold', async () => {
    const response = await request('GET', '/api/certificates/5/pdf', {
      user: SECRETARY,
      scope: 'C:20',
    });

    expect([403, 404]).toContain(response.statusCode);
  });

  it('serves the certificate as an inline private PDF', async () => {
    const response = await request('GET', '/api/certificates/5/pdf', {
      user: SECRETARY,
      scope: 'C:10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('application/pdf');
    expect(response.headers['content-disposition']).toBe(
      'inline; filename="CERT-MEM-2026-0031.pdf"',
    );
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('answers 404 with a stable code for a certificate that is not in the scope', async () => {
    const response = await request('GET', '/api/certificates/6/pdf', {
      user: SECRETARY,
      scope: 'C:10',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'CERTIFICATE_NOT_FOUND' });
  });

  it('serves the card as a two-page PDF', async () => {
    const response = await request('GET', '/api/membership-cards/9/pdf', {
      user: SECRETARY,
      scope: 'C:10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-disposition']).toBe(
      'inline; filename="carne-SC-0130.pdf"',
    );
    expect(response.rawPayload.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('rejects a non numeric id', async () => {
    const response = await request('GET', '/api/certificates/abc/pdf', {
      user: SECRETARY,
      scope: 'C:10',
    });

    expect(response.statusCode).toBe(400);
  });

  it('exports CSV with BOM and a download name', async () => {
    const response = await request('GET', '/api/certificates/export', {
      user: SECRETARY,
      scope: 'C:10',
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(response.headers['content-disposition']).toBe(
      'attachment; filename="certificados.csv"',
    );
    expect(response.body.startsWith('﻿')).toBe(true);
    expect(response.body).toContain('CERT-MEM-2026-0031');
  });

  it('validates the body of an issue request in Spanish and never reaches the use case', async () => {
    const response = await request('POST', '/api/certificates', {
      user: SECRETARY,
      scope: 'C:10',
      body: {
        memberId: 'x',
        certificateTypeId: 1,
        notes: 'n'.repeat(300),
        extra: true,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain(
      'Las observaciones admiten máximo 255 caracteres.',
    );
  });

  it('validates the dates of a card request', async () => {
    const response = await request('POST', '/api/membership-cards', {
      user: SECRETARY,
      scope: 'C:10',
      body: { memberId: 1, issuedOn: '02/11/2026', expiresOn: '2028-11-02' },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain('AAAA-MM-DD');
  });

  it('requires a congregation for issuing: a denomination scope is refused', async () => {
    access.set(SECRETARY, {
      ...access.get(SECRETARY)!,
      assignments: [
        {
          roleCode: 'SECRETARY',
          kind: 'DENOMINATION',
          scopeKey: 'D:1',
          denominationId: 1,
          congregationId: null,
          permissions: ['certificates.issue'],
        },
      ],
    });
    try {
      const response = await request(
        'GET',
        '/api/certificates/issuing-context',
        {
          user: SECRETARY,
          scope: 'D:1',
        },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        code: 'CONGREGATION_SCOPE_REQUIRED',
      });
    } finally {
      access.set(SECRETARY, {
        userId: SECRETARY,
        isActive: true,
        assignments: [
          {
            roleCode: 'SECRETARY',
            kind: 'CONGREGATION',
            scopeKey: 'C:10',
            denominationId: 1,
            congregationId: 10,
            permissions: ['certificates.issue'],
          },
        ],
      });
    }
  });
});
