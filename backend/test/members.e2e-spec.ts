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
          permissions: ['members.read', 'members.write'],
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
          permissions: ['members.read'],
        },
      ],
    },
  ],
]);

const fakeReader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(accessByUser.get(userId) ?? null),
  findCongregationDenominationId: (id) => Promise.resolve(id === 10 ? 1 : null),
};

describe('Members API: wiring, guards and tenant scope', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;
  const prisma = {
    $queryRaw: vi.fn(),
    member: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      groupBy: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
    },
  };

  const get = async (url: string, userId: number, scope?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: {
        authorization: `Bearer ${(await tokens.sign({ userId, sessionId: 'sid-1' })).token}`,
        ...(scope === undefined ? {} : { 'x-scope': scope }),
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({
        isActive: () => Promise.resolve(true),
        isEmailVerified: () => Promise.resolve(true),
      })
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

  beforeEach(() => {
    prisma.member.findMany.mockClear();
    prisma.member.count.mockClear();
    prisma.member.groupBy.mockClear();
    prisma.member.findFirst.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('requires a session', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/members' });

    expect(response.statusCode).toBe(401);
  });

  it('requires the scope header', async () => {
    const response = await get('/api/members', SECRETARY);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SCOPE_REQUIRED' });
  });

  it('refuses a role without members.read', async () => {
    const response = await get('/api/members', TREASURER, 'C:10');

    expect(response.statusCode).toBe(403);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it('refuses the export to a role that cannot write members', async () => {
    const response = await get(
      '/api/members/export',
      DENOMINATION_ADMIN,
      'D:1',
    );

    expect(response.statusCode).toBe(403);
  });

  it('lists with the tenant keys of the congregation in every query', async () => {
    const response = await get(
      '/api/members?status=ACTIVE&page=2&pageSize=5',
      SECRETARY,
      'C:10',
    );

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      items: [],
      total: 0,
      page: 2,
      pageSize: 5,
      statusCounts: {
        ALL: 0,
        ACTIVE: 0,
        INACTIVE: 0,
        TRANSFERRED: 0,
        DECEASED: 0,
      },
    });
    for (const call of [prisma.member.findMany, prisma.member.count]) {
      const { where } = call.mock.calls[0][0] as { where: object };
      expect(where).toMatchObject({
        denominationId: 1,
        congregationId: 10,
        deletedAt: null,
      });
    }
    expect(prisma.member.groupBy.mock.calls[0][0]).toMatchObject({
      where: { denominationId: 1, congregationId: 10 },
    });
  });

  it('lists the whole denomination for a denomination scope and narrows it by congregation', async () => {
    await get('/api/members?congregationId=11', DENOMINATION_ADMIN, 'D:1');

    const { where } = prisma.member.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(where.denominationId).toBe(1);
    expect(where.AND).toContainEqual({ congregationId: 11 });
  });

  it('answers 404 when a congregation scope asks for another congregation', async () => {
    const response = await get(
      '/api/members?congregationId=11',
      SECRETARY,
      'C:10',
    );

    expect(response.statusCode).toBe(404);
    expect(prisma.member.findMany).not.toHaveBeenCalled();
  });

  it('rejects invalid filters with a 400', async () => {
    const response = await get(
      '/api/members?status=NOPE&pageSize=500',
      SECRETARY,
      'C:10',
    );

    expect(response.statusCode).toBe(400);
  });

  it('answers 404 for a member that is not in the scope, and for a malformed id', async () => {
    const missing = await get('/api/members/999', SECRETARY, 'C:10');
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: 'MEMBER_NOT_FOUND' });
    expect(prisma.member.findFirst.mock.calls[0][0]).toMatchObject({
      where: { id: 999, denominationId: 1, congregationId: 10 },
    });

    const malformed = await get('/api/members/abc', SECRETARY, 'C:10');
    expect(malformed.statusCode).toBe(404);
  });

  it('refuses the socioeconomic profile without its own permission', async () => {
    const response = await get(
      '/api/members/4/socioeconomic-profile',
      SECRETARY,
      'C:10',
    );

    expect(response.statusCode).toBe(403);
  });
});
