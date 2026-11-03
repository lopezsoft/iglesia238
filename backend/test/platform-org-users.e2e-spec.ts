import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AUDIT_RECORDER } from '../src/common/audit/audit-recorder.port.js';
import { TRANSACTION_RUNNER } from '../src/common/persistence/transaction.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import {
  ASSIGNMENTS_READER,
  AssignmentsReader,
  UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import {
  CONGREGATION_REPOSITORY,
  DISTRICT_REPOSITORY,
  GEO_REPOSITORY,
  LEGAL_ENTITY_REPOSITORY,
} from '../src/modules/organization/application/organization.ports.js';
import {
  GRANT_SCOPE_READER,
  ROLE_CATALOG,
  USER_DIRECTORY,
  USER_LINK_STORE,
} from '../src/modules/users/application/users.ports.js';
import {
  ImmediateTransactionRunner,
  RecordingAuditRecorder,
} from './support/foundation-fakes.js';
import {
  InMemoryCongregationRepository,
  InMemoryDistrictRepository,
  InMemoryGeoRepository,
  InMemoryLegalEntityRepository,
  InMemoryOrganization,
} from './support/in-memory-organization.js';
import {
  InMemoryGrantScopeReader,
  InMemoryRoleCatalog,
  InMemoryUserDirectory,
  InMemoryUserLinkStore,
  InMemoryUsersWorld,
} from './support/in-memory-users.js';

const permissionsOf = (...codes: string[]) => codes;

/**
 * Real application (guards, validation pipe, error filter, Swagger decorators) over in-memory ports:
 * what is under test is the HTTP contract and the tenant isolation, not the database.
 */
describe('Platform, organization and users over HTTP', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;
  let audit: RecordingAuditRecorder;
  const organization = new InMemoryOrganization();
  const usersWorld = new InMemoryUsersWorld();

  // Users of the access reader: 1 admin of denomination 1, 2 admin of denomination 2, 3 secretary of sede 10.
  const accessByUser = new Map<number, UserAccess>();
  const sede = organization.addLegalEntity(1, { legalName: 'Corporación Uno' });
  const foreignEntity = organization.addLegalEntity(2, {
    legalName: 'Corporación Dos',
  });
  const ownSede = organization.addCongregation(1, sede.id, {
    id: 10,
    name: 'Sede Central',
    code: 'SC',
  });
  const foreignSede = organization.addCongregation(2, foreignEntity.id, {
    name: 'Sede Dos',
    code: 'SD',
  });

  const adminOne = usersWorld.addUser(
    { email: 'admin1@example.com', displayName: 'Admin Uno' },
    { role: 'DENOMINATION_ADMIN', scope: 'DENOMINATION', denominationId: 1 },
  );
  const adminTwo = usersWorld.addUser(
    { email: 'admin2@example.com', displayName: 'Admin Dos' },
    { role: 'DENOMINATION_ADMIN', scope: 'DENOMINATION', denominationId: 2 },
  );
  const secretary = usersWorld.addUser(
    { email: 'secretaria@example.com', displayName: 'Secretaria' },
    {
      role: 'SECRETARY',
      scope: 'CONGREGATION',
      denominationId: 1,
      congregationId: 10,
    },
  );

  accessByUser.set(adminOne.id, {
    userId: adminOne.id,
    isActive: true,
    assignments: [
      {
        roleCode: 'DENOMINATION_ADMIN',
        kind: 'DENOMINATION',
        scopeKey: 'D:1',
        denominationId: 1,
        congregationId: null,
        permissions: permissionsOf(
          'congregations.manage',
          'users.manage',
          'audit-logs.read',
        ),
      },
    ],
  });
  accessByUser.set(adminTwo.id, {
    userId: adminTwo.id,
    isActive: true,
    assignments: [
      {
        roleCode: 'DENOMINATION_ADMIN',
        kind: 'DENOMINATION',
        scopeKey: 'D:2',
        denominationId: 2,
        congregationId: null,
        permissions: permissionsOf('congregations.manage', 'users.manage'),
      },
    ],
  });
  accessByUser.set(secretary.id, {
    userId: secretary.id,
    isActive: true,
    assignments: [
      {
        roleCode: 'SECRETARY',
        kind: 'CONGREGATION',
        scopeKey: 'C:10',
        denominationId: 1,
        congregationId: 10,
        permissions: permissionsOf('members.read'),
      },
    ],
  });

  const reader: AssignmentsReader = {
    loadAccess: (userId) => Promise.resolve(accessByUser.get(userId) ?? null),
    findCongregationDenominationId: (id) =>
      Promise.resolve(id === 10 ? 1 : id === 20 ? 2 : null),
  };

  const call = async (
    method: 'GET' | 'POST' | 'PUT' | 'PATCH',
    url: string,
    options: { userId?: number; scope?: string; body?: unknown } = {},
  ) =>
    app.inject({
      method,
      url,
      headers: {
        ...(options.userId === undefined
          ? {}
          : {
              authorization: `Bearer ${(await tokens.sign({ userId: options.userId, sessionId: 'sid-1' })).token}`,
            }),
        ...(options.scope === undefined ? {} : { 'x-scope': options.scope }),
      },
      ...(options.body === undefined
        ? {}
        : { payload: options.body as object }),
    });

  const sedeBody = (overrides: Record<string, unknown> = {}) => ({
    name: 'Sede Norte',
    legalEntityId: sede.id,
    municipalityCode: '13001',
    address: 'Calle 1 # 2-3',
    acceptsApplications: true,
    ...overrides,
  });

  beforeAll(async () => {
    audit = new RecordingAuditRecorder();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(SESSION_VALIDATOR)
      .useValue({ isActive: () => Promise.resolve(true) })
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(reader)
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(new ImmediateTransactionRunner())
      .overrideProvider(AUDIT_RECORDER)
      .useValue(audit)
      .overrideProvider(CONGREGATION_REPOSITORY)
      .useValue(new InMemoryCongregationRepository(organization))
      .overrideProvider(LEGAL_ENTITY_REPOSITORY)
      .useValue(new InMemoryLegalEntityRepository(organization))
      .overrideProvider(DISTRICT_REPOSITORY)
      .useValue(new InMemoryDistrictRepository(organization))
      .overrideProvider(GEO_REPOSITORY)
      .useValue(new InMemoryGeoRepository(organization))
      .overrideProvider(USER_DIRECTORY)
      .useValue(new InMemoryUserDirectory(usersWorld))
      .overrideProvider(ROLE_CATALOG)
      .useValue(new InMemoryRoleCatalog())
      .overrideProvider(GRANT_SCOPE_READER)
      .useValue(new InMemoryGrantScopeReader(usersWorld))
      .overrideProvider(USER_LINK_STORE)
      .useValue(new InMemoryUserLinkStore(usersWorld))
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

  describe('authentication and scope', () => {
    it('answers 401 without a token and 400 without X-Scope', async () => {
      expect(
        (await call('GET', '/api/organization/congregations')).statusCode,
      ).toBe(401);

      const noScope = await call('GET', '/api/organization/congregations', {
        userId: adminOne.id,
      });
      expect(noScope.statusCode).toBe(400);
      expect(noScope.json()).toMatchObject({ code: 'SCOPE_REQUIRED' });
    });

    it('answers 403 to a role without the permission', async () => {
      const response = await call('GET', '/api/organization/congregations', {
        userId: secretary.id,
        scope: 'C:10',
      });

      expect(response.statusCode).toBe(403);
    });

    it('answers 403 when the scope belongs to another denomination', async () => {
      const response = await call('GET', '/api/organization/congregations', {
        userId: adminOne.id,
        scope: 'D:2',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
    });
  });

  describe('organization', () => {
    it('lists only the sedes of the denomination of the session', async () => {
      const first = await call('GET', '/api/organization/congregations', {
        userId: adminOne.id,
        scope: 'D:1',
      });
      const second = await call('GET', '/api/organization/congregations', {
        userId: adminTwo.id,
        scope: 'D:2',
      });

      expect(first.json<{ id: number }[]>().map((row) => row.id)).toEqual([
        ownSede.id,
      ]);
      expect(second.json<{ id: number }[]>().map((row) => row.id)).toEqual([
        foreignSede.id,
      ]);
    });

    it('creates a sede (201) with a generated code and audits it', async () => {
      const before = audit.entries.length;
      const response = await call('POST', '/api/organization/congregations', {
        userId: adminOne.id,
        scope: 'D:1',
        body: sedeBody({ name: '  Sede   Norte ', neighborhood: 'Centro' }),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({
        name: 'Sede Norte',
        code: 'NOR',
        municipalityName: 'Cartagena de Indias',
        regionName: 'Bolívar',
        neighborhood: 'Centro',
        isActive: true,
      });
      expect(audit.entries.length).toBe(before + 1);
    });

    it('rejects an invalid body with 400 and Spanish messages', async () => {
      const response = await call('POST', '/api/organization/congregations', {
        userId: adminOne.id,
        scope: 'D:1',
        body: sedeBody({
          name: '',
          municipalityCode: 'abc',
          extra: 'not allowed',
        }),
      });

      expect(response.statusCode).toBe(400);
      const body = response.json<{ code: string; message: string[] }>();
      expect(body.code).toBe('VALIDATION_ERROR');
      expect(body.message).toEqual(
        expect.arrayContaining([
          'El nombre de la sede es obligatorio.',
          'Selecciona un municipio válido.',
        ]),
      );
    });

    it('answers 409 with a code for a duplicate name', async () => {
      const response = await call('POST', '/api/organization/congregations', {
        userId: adminOne.id,
        scope: 'D:1',
        body: sedeBody({ name: 'sede central' }),
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'DUPLICATE_NAME' });
    });

    it('answers 404 when another denomination touches a sede it does not own', async () => {
      const response = await call(
        'PATCH',
        `/api/organization/congregations/${ownSede.id}/status`,
        {
          userId: adminTwo.id,
          scope: 'D:2',
          body: { isActive: false },
        },
      );

      expect(response.statusCode).toBe(404);
      expect(
        organization.congregations.find((row) => row.id === ownSede.id)
          ?.isActive,
      ).toBe(true);
    });

    it('answers 404 to an id that is not a positive integer', async () => {
      const response = await call(
        'PUT',
        '/api/organization/congregations/abc',
        {
          userId: adminOne.id,
          scope: 'D:1',
          body: sedeBody(),
        },
      );

      expect(response.statusCode).toBe(404);
    });

    it('offers the sedes of the scope to any session through /congregations/selectable', async () => {
      const own = await call('GET', '/api/congregations/selectable', {
        userId: secretary.id,
        scope: 'C:10',
      });

      expect(own.statusCode).toBe(200);
      expect(own.json<{ id: number }[]>().map((row) => row.id)).toEqual([
        ownSede.id,
      ]);
    });
  });

  describe('users', () => {
    it('invites a user and returns the one-time link only in the response', async () => {
      const response = await call('POST', '/api/users/invitations', {
        userId: adminOne.id,
        scope: 'D:1',
        body: {
          displayName: 'Marta Nueva',
          email: 'Marta@Example.com',
          role: 'SECRETARY',
          congregationId: 10,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json<{
        user: { email: string; status: string };
        invitation: { link: string; emailDelivered: boolean };
      }>();
      expect(body.user).toMatchObject({
        email: 'marta@example.com',
        status: 'INVITATION_PENDING',
      });
      expect(body.invitation.link).toMatch(
        /\/login\/accept-invitation\?token=/,
      );
      expect(JSON.stringify(audit.entries)).not.toContain(
        new URL(body.invitation.link).searchParams.get('token') as string,
      );
    });

    it('does not let a denomination administrator grant the platform role', async () => {
      const response = await call('POST', `/api/users/${secretary.id}/roles`, {
        userId: adminOne.id,
        scope: 'D:1',
        body: { role: 'PLATFORM_ADMIN' },
      });

      expect(response.statusCode).toBe(403);
    });

    it('does not list users of another denomination', async () => {
      const response = await call('GET', '/api/users?pageSize=50', {
        userId: adminTwo.id,
        scope: 'D:2',
      });

      const emails = response
        .json<{ items: { email: string }[] }>()
        .items.map((row) => row.email);
      expect(emails).toContain('admin2@example.com');
      expect(emails).not.toContain('secretaria@example.com');
    });

    it('refuses to revoke your own administrator role with a code', async () => {
      const own = usersWorld.assignments.find(
        (row) => row.userId === adminOne.id,
      );
      const response = await call('POST', `/api/user-roles/${own?.id}/revoke`, {
        userId: adminOne.id,
        scope: 'D:1',
      });

      expect(response.statusCode).toBe(409);
      expect(response.json()).toMatchObject({ code: 'SELF_REVOKE' });
    });

    it('validates the query of the list', async () => {
      const response = await call(
        'GET',
        '/api/users?status=SLEEPING&pageSize=500',
        {
          userId: adminOne.id,
          scope: 'D:1',
        },
      );

      expect(response.statusCode).toBe(400);
    });
  });

  describe('audit log', () => {
    it('rejects a range longer than 90 days before reaching the database', async () => {
      const response = await call(
        'GET',
        '/api/audit-logs?from=2026-01-01&to=2026-06-01',
        {
          userId: adminOne.id,
          scope: 'D:1',
        },
      );

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({ code: 'RANGE_TOO_LONG' });
    });

    it('answers 403 to a role without audit-logs.read', async () => {
      const response = await call('GET', '/api/audit-logs', {
        userId: adminTwo.id,
        scope: 'D:2',
      });

      expect(response.statusCode).toBe(403);
    });
  });
});
