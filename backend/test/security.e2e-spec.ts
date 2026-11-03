import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  DiscoveryService,
  MetadataScanner,
  ModulesContainer,
  Reflector,
} from '@nestjs/core';
import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import { IS_PUBLIC_KEY } from '../src/common/security/public.decorator.js';
import {
  ASSIGNMENTS_READER,
  AssignmentsReader,
  UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { ErrorProbeModule } from './error-probe.controller.js';
import { SecurityProbeModule } from './security-probe.controller.js';

const accessByUser = new Map<number, UserAccess>([
  [
    1,
    {
      userId: 1,
      isActive: true,
      assignments: [
        {
          roleCode: 'SECRETARY',
          kind: 'CONGREGATION',
          scopeKey: 'C:10',
          denominationId: 1,
          congregationId: 10,
          permissions: ['members.read'],
        },
      ],
    },
  ],
  [
    2,
    {
      userId: 2,
      isActive: true,
      assignments: [
        {
          roleCode: 'PLATFORM_ADMIN',
          kind: 'PLATFORM',
          scopeKey: 'P',
          denominationId: null,
          congregationId: null,
          permissions: ['denominations.manage'],
        },
      ],
    },
  ],
  [
    3,
    {
      userId: 3,
      isActive: false,
      assignments: [],
    },
  ],
]);

const fakeReader: AssignmentsReader = {
  loadAccess: (userId) => Promise.resolve(accessByUser.get(userId) ?? null),
  findCongregationDenominationId: (id) =>
    Promise.resolve(id === 10 ? 1 : id === 20 ? 2 : null),
};

describe('Security: authentication, scope and permissions', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;

  const bearer = async (userId: number) =>
    `Bearer ${(await tokens.sign({ userId, sessionId: 'sid-1' })).token}`;

  const get = async (url: string, userId?: number, scope?: string) =>
    app.inject({
      method: 'GET',
      url,
      headers: {
        ...(userId === undefined
          ? {}
          : { authorization: await bearer(userId) }),
        ...(scope === undefined ? {} : { 'x-scope': scope }),
      },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ErrorProbeModule, SecurityProbeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
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

  afterAll(async () => {
    await app.close();
  });

  it('answers 401 with a code when there is no token', async () => {
    const response = await get('/api/test-security/open');

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      statusCode: 401,
      code: 'UNAUTHENTICATED',
    });
  });

  it('answers 401 for a token signed with another secret', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test-security/open',
      headers: {
        authorization:
          'Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIiwic2lkIjoieCJ9.invalidsignature',
      },
    });

    expect(response.statusCode).toBe(401);
  });

  it('serves @Public() routes without a token', async () => {
    expect((await get('/api/test-security/public')).statusCode).toBe(200);
    expect((await get('/api/health')).statusCode).toBe(200);
  });

  it('lets an authenticated user reach a route that declares no permissions', async () => {
    expect((await get('/api/test-security/open', 1)).statusCode).toBe(200);
  });

  it('answers 400 SCOPE_REQUIRED when a protected route gets no X-Scope', async () => {
    const response = await get('/api/test-security/members', 1);

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SCOPE_REQUIRED' });
  });

  it('answers 400 SCOPE_INVALID for a malformed X-Scope', async () => {
    const response = await get('/api/test-security/members', 1, 'C:abc');

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: 'SCOPE_INVALID' });
  });

  it('serves a route when the scope is covered and the permission is held', async () => {
    const response = await get('/api/test-security/members', 1, 'C:10');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scopeKey: 'C:10',
      denominationId: 1,
      congregationId: 10,
    });
  });

  it('answers 403 SCOPE_FORBIDDEN for a scope of another tenant', async () => {
    const response = await get('/api/test-security/members', 1, 'C:20');

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
  });

  it('answers 403 when the permission is missing in the scope', async () => {
    expect(
      (await get('/api/test-security/members-write', 1, 'C:10')).statusCode,
    ).toBe(403);
    expect(
      (await get('/api/test-security/reports', 1, 'C:10')).statusCode,
    ).toBe(403);
  });

  it('never gives tenant routes to the platform scope', async () => {
    expect((await get('/api/test-security/members', 2, 'P')).statusCode).toBe(
      403,
    );
    expect(
      (await get('/api/test-security/members', 2, 'C:10')).statusCode,
    ).toBe(403);
  });

  it('answers 401 for a disabled account even with a valid token', async () => {
    const response = await get('/api/test-security/open', 3, 'P');

    expect(response.statusCode).toBe(401);
  });

  it('answers an unknown route with 404 and a code', async () => {
    const response = await get('/api/unknown');

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'NOT_FOUND' });
  });

  it('leaves no route open by accident: every route that is not @Public() rejects anonymous calls', async () => {
    const discovery = new DiscoveryService(app.get(ModulesContainer));
    const scanner = new MetadataScanner();
    const reflector = app.get(Reflector);
    const unprotected: string[] = [];
    let checked = 0;

    for (const wrapper of discovery.getControllers()) {
      const instance = wrapper.instance as object | null;
      const metatype = wrapper.metatype as (new () => object) | null;
      if (!instance || !metatype) {
        continue;
      }
      const prefix = Reflect.getMetadata(PATH_METADATA, metatype) as string;
      const prototype = Object.getPrototypeOf(instance) as object;

      for (const name of scanner.getAllMethodNames(prototype)) {
        const handler = (prototype as Record<string, () => unknown>)[name];
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as
          RequestMethod | undefined;
        if (method === undefined) {
          continue;
        }
        const isPublic = reflector.getAllAndOverride<boolean | undefined>(
          IS_PUBLIC_KEY,
          [handler, metatype],
        );
        if (isPublic) {
          continue;
        }

        const path = Reflect.getMetadata(PATH_METADATA, handler) as string;
        const url = `/api/${[prefix, path]
          .filter((part) => part && part !== '/')
          .join('/')}`.replace(/:[A-Za-z]+/g, '1');
        const response = await app.inject({
          method: RequestMethod[method] as 'GET',
          url,
        });
        checked += 1;
        if (response.statusCode !== 401) {
          unprotected.push(
            `${RequestMethod[method]} ${url} -> ${response.statusCode}`,
          );
        }
      }
    }

    expect(checked).toBeGreaterThan(0);
    expect(unprotected).toEqual([]);
  });
});
