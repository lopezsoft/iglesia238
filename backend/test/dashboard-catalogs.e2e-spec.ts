import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { RATE_LIMITER } from '../src/common/rate-limit/rate-limiter.port.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import {
  ASSIGNMENTS_READER,
  type AssignmentsReader,
  type UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { CATALOGS_READER } from '../src/modules/catalogs/application/catalogs.reader.js';
import { DASHBOARD_OPERATIONS_READER } from '../src/modules/dashboard/application/ports/dashboard-operations.reader.js';
import { DASHBOARD_SCOPE_READER } from '../src/modules/dashboard/application/ports/dashboard-scope.reader.js';
import {
  AUDIT_ACTIVITY_READER,
  DASHBOARD_STATS_READER,
} from '../src/modules/dashboard/application/ports/dashboard-stats.reader.js';

const ADMIN: UserAccess = {
  userId: 1,
  isActive: true,
  assignments: [
    {
      roleCode: 'DENOMINATION_ADMIN',
      kind: 'DENOMINATION',
      scopeKey: 'D:1',
      denominationId: 1,
      congregationId: null,
      permissions: ['users.manage', 'audit-logs.read', 'congregations.manage'],
    },
  ],
};
const SECRETARY: UserAccess = {
  userId: 2,
  isActive: true,
  assignments: [
    {
      roleCode: 'SECRETARY',
      kind: 'CONGREGATION',
      scopeKey: 'C:10',
      denominationId: 1,
      congregationId: 10,
      permissions: ['socioeconomic-profiles.read'],
    },
  ],
};

const reader: AssignmentsReader = {
  loadAccess: (id) =>
    Promise.resolve(id === 1 ? ADMIN : id === 2 ? SECRETARY : null),
  findCongregationDenominationId: (id) => Promise.resolve(id === 10 ? 1 : null),
};

const catalogs = {
  documentTypes: [{ code: 'CC', name: 'Cédula de ciudadanía' }],
  maritalStatuses: [{ code: 'SINGLE', name: 'Soltero(a)' }],
  educationLevels: [{ code: 'PRIMARY', name: 'Primaria' }],
  studyTypes: [],
  meetingTypes: [],
  attendanceCategories: [],
};

describe('Dashboard and catalogs endpoints', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;

  const authorize = async (userId: number) =>
    `Bearer ${(await tokens.sign({ userId, sessionId: 's' })).token}`;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(RATE_LIMITER)
      .useValue({
        consume: () => Promise.resolve({ allowed: true, retryAfterSeconds: 0 }),
        reset: () => Promise.resolve(),
      })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({ isActive: () => Promise.resolve(true) })
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(reader)
      .overrideProvider(CATALOGS_READER)
      .useValue({
        listGlobalCatalogs: () => Promise.resolve(catalogs),
        searchMunicipalities: (_search: string | null, limit: number) =>
          Promise.resolve(
            [
              {
                code: '05001',
                name: 'Medellín',
                regionCode: '05',
                regionName: 'Antioquia',
              },
            ].slice(0, limit),
          ),
        findMunicipality: () => Promise.resolve(null),
        listNeighborhoods: () => Promise.resolve(null),
        ensureNeighborhood: () => Promise.resolve(null),
      })
      .overrideProvider(DASHBOARD_SCOPE_READER)
      .useValue({
        describe: (tenant: { kind: string }) =>
          Promise.resolve({
            kind: tenant.kind,
            label: 'Iglesia Ejemplo',
            denominationName: 'Iglesia Ejemplo',
          }),
      })
      .overrideProvider(DASHBOARD_STATS_READER)
      .useValue({
        countDenominations: () => Promise.resolve({ active: 1, inactive: 0 }),
        countActiveCongregations: () => Promise.resolve(2),
        countUsers: () => Promise.resolve({ active: 5, pendingInvitations: 2 }),
        countLockedAccounts: () => Promise.resolve(0),
      })
      .overrideProvider(DASHBOARD_OPERATIONS_READER)
      .useValue({
        countMembers: () =>
          Promise.resolve({
            active: 40,
            joinedInRange: 3,
            joinedInPrevious: 1,
          }),
        countOpenApplications: () => Promise.resolve(0),
        countCertificatesIssued: () => Promise.resolve(0),
        countCardsExpiring: () => Promise.resolve(0),
        countAttendanceSessions: () => Promise.resolve(0),
        latestAttendance: () => Promise.resolve(null),
      })
      .overrideProvider(AUDIT_ACTIVITY_READER)
      .useValue({
        countEvents: () => Promise.resolve(3),
        eventsPerDay: (_scope: unknown, days: string[]) =>
          Promise.resolve(days.map(() => 1)),
        eventsPerMonth: (_scope: unknown, months: string[]) =>
          Promise.resolve(months.map(() => 2)),
        recent: () => Promise.resolve([]),
      })
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

  describe('GET /api/dashboard/summary', () => {
    const summary = async (userId: number, scope?: string, query = '') =>
      app.inject({
        method: 'GET',
        url: `/api/dashboard/summary${query}`,
        headers: {
          authorization: await authorize(userId),
          ...(scope ? { 'x-scope': scope } : {}),
        },
      });

    it('requires authentication and a scope', async () => {
      expect(
        (await app.inject({ method: 'GET', url: '/api/dashboard/summary' }))
          .statusCode,
      ).toBe(401);
      const noScope = await summary(1);
      expect(noScope.statusCode).toBe(400);
      expect(noScope.json()).toMatchObject({ code: 'SCOPE_REQUIRED' });
    });

    it('returns the widgets the role of the scope can read', async () => {
      const response = await summary(1, 'D:1', '?period=7d');

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        period: string;
        hero: { key: string; previous: number };
        kpis: { key: string }[];
        lists: { key: string }[];
        trends: { key: string }[];
        unavailable: string[];
      }>();
      expect(body.period).toBe('7d');
      expect(body.hero).toMatchObject({ key: 'activity', previous: 3 });
      expect(body.kpis.map((kpi) => kpi.key)).toEqual(['sedes', 'users']);
      expect(body.lists.map((list) => list.key)).toEqual(['recent-audit']);
      expect(body.trends.map((trend) => trend.key)).toEqual(['activity-trend']);
      expect(body.unavailable).toEqual([]);
    });

    it("gives a role without those permissions an empty page, never other roles' widgets", async () => {
      const response = await summary(2, 'C:10');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        hero: null,
        kpis: [],
        panels: [],
        lists: [],
        trends: [],
      });
    });

    it('answers 403 for a scope the user does not hold', async () => {
      const response = await summary(2, 'D:1');

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
    });

    it('answers 400 for an unknown period', async () => {
      const response = await summary(1, 'D:1', '?period=year');

      expect(response.statusCode).toBe(400);
    });
  });

  describe('catalogs', () => {
    it('serves the public subset without a token, with an ETag that yields 304', async () => {
      const first = await app.inject({
        method: 'GET',
        url: '/api/public/catalogs',
      });

      expect(first.statusCode).toBe(200);
      expect(Object.keys(first.json())).toEqual([
        'documentTypes',
        'maritalStatuses',
      ]);
      const etag = first.headers.etag as string;
      expect(etag).toBeTruthy();

      const second = await app.inject({
        method: 'GET',
        url: '/api/public/catalogs',
        headers: { 'if-none-match': etag },
      });
      expect(second.statusCode).toBe(304);
      expect(second.body).toBe('');
    });

    it('serves every catalog only to a signed-in user', async () => {
      expect(
        (await app.inject({ method: 'GET', url: '/api/catalogs' })).statusCode,
      ).toBe(401);

      const response = await app.inject({
        method: 'GET',
        url: '/api/catalogs',
        headers: { authorization: await authorize(2) },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toHaveProperty('educationLevels');
    });

    it('searches municipalities, publicly and signed in, and validates the limit', async () => {
      const publicSearch = await app.inject({
        method: 'GET',
        url: '/api/public/geo/municipalities?search=Medel&limit=5',
      });
      expect(publicSearch.statusCode).toBe(200);
      expect(publicSearch.json()).toEqual([
        {
          code: '05001',
          name: 'Medellín',
          regionCode: '05',
          regionName: 'Antioquia',
        },
      ]);

      const tooMany = await app.inject({
        method: 'GET',
        url: '/api/geo/municipalities?limit=500',
        headers: { authorization: await authorize(2) },
      });
      expect(tooMany.statusCode).toBe(400);
    });

    it('answers 404 for a malformed or unknown municipality code', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/geo/municipalities/abc',
        headers: { authorization: await authorize(2) },
      });

      expect(response.statusCode).toBe(404);
    });

    it('lets only roles that capture addresses create neighborhoods', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/geo/municipalities/05001/neighborhoods',
        headers: { authorization: await authorize(2), 'x-scope': 'C:10' },
        payload: { name: 'Laureles' },
      });

      // The secretary has members.read but not members.write.
      expect(response.statusCode).toBe(403);
    });
  });
});
