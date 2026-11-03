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

const SECRETARY = 1;
const TREASURER = 2;
const DENOMINATION_ADMIN = 3;

const accessByUser = new Map<number, UserAccess>([
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
          permissions: ['applications.review', 'members.read'],
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
  [
    DENOMINATION_ADMIN,
    {
      userId: DENOMINATION_ADMIN,
      isActive: true,
      assignments: [
        {
          roleCode: 'DENOMINATION_ADMIN',
          kind: 'DENOMINATION',
          scopeKey: 'D:1',
          denominationId: 1,
          congregationId: null,
          permissions: ['congregations.manage'],
        },
      ],
    },
  ],
]);

const fakeReader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(accessByUser.get(userId) ?? null),
  findCongregationDenominationId: (id) => Promise.resolve(id === 10 ? 1 : null),
};

const prismaMock = {
  $queryRaw: vi.fn(),
  $transaction: vi.fn(),
  membershipApplication: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
    findFirst: vi.fn(),
    findUnique: vi.fn(),
  },
  congregation: { findMany: vi.fn() },
  privacyPolicy: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() },
  auditLog: { create: vi.fn() },
};

describe('Applications API: wiring, guards and tenant scope', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;

  const call = async (options: {
    method: 'GET' | 'POST';
    url: string;
    userId?: number;
    scope?: string;
    payload?: Record<string, unknown>;
  }) =>
    app.inject({
      method: options.method,
      url: options.url,
      payload: options.payload,
      headers: {
        ...(options.userId === undefined
          ? {}
          : {
              authorization: `Bearer ${(await tokens.sign({ userId: options.userId, sessionId: 'sid' })).token}`,
            }),
        ...(options.scope === undefined ? {} : { 'x-scope': options.scope }),
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({ isActive: () => Promise.resolve(true) })
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(fakeReader)
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

  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.$transaction.mockImplementation(
      (work: (client: typeof prismaMock) => unknown) => work(prismaMock),
    );
  });

  describe('review', () => {
    it('needs a session', async () => {
      const response = await call({
        method: 'GET',
        url: '/api/membership-applications',
      });

      expect(response.statusCode).toBe(401);
    });

    it('needs the applications.review permission', async () => {
      const response = await call({
        method: 'GET',
        url: '/api/membership-applications',
        userId: TREASURER,
        scope: 'C:10',
      });

      expect(response.statusCode).toBe(403);
    });

    it('refuses a congregation that is not in the roles of the user', async () => {
      const response = await call({
        method: 'GET',
        url: '/api/membership-applications',
        userId: SECRETARY,
        scope: 'C:20',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
      expect(prismaMock.membershipApplication.findMany).not.toHaveBeenCalled();
    });

    it('lists the queue filtered by the tenant of the session', async () => {
      prismaMock.membershipApplication.findMany.mockResolvedValue([]);
      prismaMock.membershipApplication.count.mockResolvedValue(0);
      prismaMock.membershipApplication.groupBy.mockResolvedValue([
        { status: 'PENDING', _count: { _all: 2 } },
        { status: 'APPROVED', _count: { _all: 1 } },
      ]);

      const response = await call({
        method: 'GET',
        url: '/api/membership-applications?filter=PENDING&q=ana&page=2',
        userId: SECRETARY,
        scope: 'C:10',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        items: [],
        total: 0,
        page: 2,
        pageSize: 25,
        counts: { PENDING: 2, DUPLICATE: 0, APPROVED: 1, REJECTED: 0, ALL: 3 },
      });
      const args = prismaMock.membershipApplication.findMany.mock
        .calls[0][0] as {
        where: Record<string, unknown>;
        skip: number;
      };
      expect(args.where).toMatchObject({
        denominationId: 1,
        congregationId: 10,
      });
      expect(args.skip).toBe(25);
    });

    it('answers 404 for an application that is not in the tenant', async () => {
      prismaMock.membershipApplication.findFirst.mockResolvedValue(null);

      const response = await call({
        method: 'GET',
        url: '/api/membership-applications/77',
        userId: SECRETARY,
        scope: 'C:10',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
      expect(
        prismaMock.membershipApplication.findFirst.mock.calls[0][0],
      ).toMatchObject({
        where: { id: 77, denominationId: 1, congregationId: 10 },
      });
    });

    it('validates the body of a rejection', async () => {
      const response = await call({
        method: 'POST',
        url: '/api/membership-applications/5/reject',
        userId: SECRETARY,
        scope: 'C:10',
        payload: { reason: 42 },
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('public form', () => {
    it('lists the open sedes without a session', async () => {
      prismaMock.congregation.findMany.mockResolvedValue([]);

      const response = await call({
        method: 'GET',
        url: '/api/public/congregations',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([]);
    });

    it('answers 404 to the policy of a denomination without one', async () => {
      prismaMock.privacyPolicy.findFirst.mockResolvedValue(null);

      const response = await call({
        method: 'GET',
        url: '/api/public/denominations/1/privacy-policy/current',
      });

      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({ code: 'POLICY_NOT_AVAILABLE' });
    });

    it('answers the same 404 to a malformed and to an unknown tracking code', async () => {
      prismaMock.membershipApplication.findUnique.mockResolvedValue(null);

      const malformed = await call({
        method: 'POST',
        url: '/api/public/membership-applications/status',
        payload: { trackingCode: 'hola' },
      });
      const unknown = await call({
        method: 'POST',
        url: '/api/public/membership-applications/status',
        payload: { trackingCode: 'IG-AAAA-BBBB' },
      });

      expect(malformed.statusCode).toBe(404);
      expect(unknown.statusCode).toBe(404);
      expect(malformed.json()).toMatchObject({
        code: 'NOT_FOUND',
        message: 'No encontramos una solicitud con ese código.',
      });
      expect(unknown.json()).toMatchObject({ code: 'NOT_FOUND' });
    });

    it('shows only the status of an application found by its tracking code', async () => {
      prismaMock.membershipApplication.findUnique.mockResolvedValue({
        status: 'DUPLICATE',
        createdAt: new Date('2026-11-01T10:00:00.000Z'),
        reviewedAt: new Date('2026-11-02T10:00:00.000Z'),
      });

      const response = await call({
        method: 'POST',
        url: '/api/public/membership-applications/status',
        payload: { trackingCode: ' ig-7f3k-92qd ' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        status: 'IN_REVIEW',
        statusLabel: 'En revisión',
        submittedOn: '2026-11-01T10:00:00.000Z',
        reviewedOn: null,
        notice: null,
      });
    });

    it('rejects a submission with fields the form does not have', async () => {
      const response = await call({
        method: 'POST',
        url: '/api/public/membership-applications',
        payload: { denominationId: 2, congregationId: 10 },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
      expect(prismaMock.membershipApplication.findMany).not.toHaveBeenCalled();
    });
  });

  describe('privacy policies', () => {
    it('lets a secretary with applications.review neither create nor publish', async () => {
      const payload = {
        version: '2.0',
        content: 'x'.repeat(80),
        effectiveFrom: '2026-12-01',
      };

      expect(
        (
          await call({
            method: 'POST',
            url: '/api/privacy-policies',
            userId: SECRETARY,
            scope: 'C:10',
            payload,
          })
        ).statusCode,
      ).toBe(403);
      expect(
        (
          await call({
            method: 'POST',
            url: '/api/privacy-policies/1/publish',
            userId: SECRETARY,
            scope: 'C:10',
          })
        ).statusCode,
      ).toBe(403);
    });

    it('creates a draft for the denomination administrator, inside a transaction, with audit', async () => {
      prismaMock.privacyPolicy.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({
          id: 9,
          denominationId: 1,
          version: '2.0',
          content: 'x'.repeat(80),
          effectiveFrom: new Date('2026-12-01T00:00:00.000Z'),
          status: 'DRAFT',
          publishedAt: null,
          _count: { dataConsents: 0, membershipApplications: 0 },
        });
      prismaMock.privacyPolicy.create.mockResolvedValue({ id: 9 });

      const response = await call({
        method: 'POST',
        url: '/api/privacy-policies',
        userId: DENOMINATION_ADMIN,
        scope: 'D:1',
        payload: {
          version: '2.0',
          content: 'x'.repeat(80),
          effectiveFrom: '2026-12-01',
        },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        id: 9,
        version: '2.0',
        status: 'DRAFT',
        state: 'DRAFT',
        effectiveFrom: '2026-12-01',
      });
      expect(prismaMock.privacyPolicy.create.mock.calls[0][0]).toMatchObject({
        data: { denominationId: 1, status: 'DRAFT' },
      });
      expect(prismaMock.auditLog.create).toHaveBeenCalledTimes(1);
    });

    it('lets a secretary read the versions', async () => {
      prismaMock.privacyPolicy.findMany.mockResolvedValue([]);

      const response = await call({
        method: 'GET',
        url: '/api/privacy-policies',
        userId: SECRETARY,
        scope: 'C:10',
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ items: [], hasCurrentPolicy: false });
    });
  });
});
