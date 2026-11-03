import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { AUDIT_RECORDER } from '../src/common/audit/audit-recorder.port.js';
import { MAILER } from '../src/common/mail/mailer.port.js';
import { TRANSACTION_RUNNER } from '../src/common/persistence/transaction.js';
import { RATE_LIMITER } from '../src/common/rate-limit/rate-limiter.port.js';
import { AccessTokenService } from '../src/common/security/access-token.service.js';
import { PASSWORD_HASHER } from '../src/common/security/password-hasher.port.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import {
  ASSIGNMENTS_READER,
  type AssignmentsReader,
  type RoleAssignmentView,
  type UserAccess,
} from '../src/common/tenancy/assignments-reader.port.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { AUTH_ACCOUNT_REPOSITORY } from '../src/modules/auth/application/ports/auth-account.repository.js';
import { REFRESH_TOKEN_REPOSITORY } from '../src/modules/auth/application/ports/refresh-token.repository.js';
import {
  SESSION_PROFILE_READER,
  type SessionProfileReader,
} from '../src/modules/auth/application/ports/session-profile.reader.js';
import { USER_TOKEN_REPOSITORY } from '../src/modules/auth/application/ports/user-token.repository.js';
import {
  FakeAccounts,
  FakeHasher,
  FakeMailer,
  FakeRefreshTokens,
  FakeUserTokens,
  buildAccount,
  buildSession,
} from '../src/modules/auth/application/testing/auth-fakes.js';
import {
  CONGREGATION_REPOSITORY,
  DISTRICT_REPOSITORY,
  GEO_REPOSITORY,
  LEGAL_ENTITY_REPOSITORY,
  PLATFORM_LEGAL_ENTITY_READER,
} from '../src/modules/organization/application/organization.ports.js';
import { CONGREGATION_REGISTRATION_STORE } from '../src/modules/public/application/ports/congregation-registration.store.js';
import { PUBLIC_DIRECTORY } from '../src/modules/public/application/ports/public-directory.reader.js';
import { InMemoryPublicWorld } from '../src/modules/public/application/testing/in-memory-public.js';
import { InMemoryRegistrationWorld } from '../src/modules/public/application/testing/in-memory-registration.js';
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
  InMemoryPlatformLegalEntityReader,
  COLOMBIA,
  OTHER_COUNTRY,
} from './support/in-memory-organization.js';

const PASSWORD = 'Cordero-2026-Fuerte';

const PLATFORM_ADMIN = 1;
const ADMIN_DENOMINATION_1 = 2;
const ADMIN_DENOMINATION_2 = 3;
const UNVERIFIED_PLATFORM_ADMIN = 4;

const assignment = (
  roleCode: string,
  kind: RoleAssignmentView['kind'],
  ids: { denominationId: number | null; congregationId: number | null },
  permissions: string[],
): RoleAssignmentView => ({
  roleCode,
  kind,
  scopeKey:
    kind === 'PLATFORM'
      ? 'P'
      : kind === 'DENOMINATION'
        ? `D:${ids.denominationId}`
        : `C:${ids.congregationId}`,
  ...ids,
  permissions,
});

/**
 * The real application (guards, validation, error filter, Swagger decorators) over in-memory ports.
 * The registration store mirrors the rows it creates into the fakes of the auth module, so the whole
 * journey runs over HTTP: register, sign in, get blocked, confirm the e-mail, work.
 */
describe('Congregation self-registration, e-mail confirmation and platform legal entities', () => {
  let app: NestFastifyApplication;
  let tokens: AccessTokenService;

  const accounts = new FakeAccounts();
  const refreshTokens = new FakeRefreshTokens();
  const userTokens = new FakeUserTokens();
  const mailer = new FakeMailer();
  const audit = new RecordingAuditRecorder();
  const publicWorld = new InMemoryPublicWorld();
  const registrationWorld = new InMemoryRegistrationWorld();
  const organization = new InMemoryOrganization();
  const access = new Map<number, UserAccess>();
  const congregationDenomination = new Map<number, number>();
  const limiter = { mode: 'allow' as 'allow' | 'block' | 'fail' };

  const entity1 = organization.addLegalEntity(1, {
    legalName: 'Corporación Uno',
  });
  const entity2 = organization.addLegalEntity(2, {
    legalName: 'Corporación Dos',
  });
  organization.addCongregation(1, entity1.id, { name: 'Sede Central' });

  const reader: AssignmentsReader = {
    loadAccess: (userId) => Promise.resolve(access.get(userId) ?? null),
    findCongregationDenominationId: (id) =>
      Promise.resolve(congregationDenomination.get(id) ?? null),
  };

  // Whether the e-mail is confirmed is read from the account, like the database does. Tokens signed
  // by the helper below (session "sid-1") are always open; the ones from a real login use their family.
  const sessionValidator = {
    isActive: (userId: number, sessionId: string, now: Date) =>
      sessionId === 'sid-1'
        ? Promise.resolve(true)
        : refreshTokens.isActive(userId, sessionId, now),
    isEmailVerified: (userId: number) =>
      Promise.resolve(accounts.get(userId)?.emailVerifiedAt != null),
  };
  const sessionProfiles: SessionProfileReader = {
    load: (userId) => {
      const account = accounts.get(userId);
      const hasAccess = (access.get(userId)?.assignments.length ?? 0) > 0;
      return Promise.resolve(
        account && hasAccess
          ? {
              ...buildSession(userId),
              email: account.email,
              emailVerified: account.emailVerifiedAt !== null,
            }
          : null,
      );
    },
  };

  const call = async (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    options: {
      userId?: number;
      scope?: string;
      payload?: unknown;
      headers?: Record<string, string>;
    } = {},
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
        ...options.headers,
      },
      ...(options.payload === undefined
        ? {}
        : { payload: options.payload as object }),
    });

  const registrationBody = (
    overrides: { name?: string; email?: string; legalEntityId?: number } = {},
  ) => ({
    legalEntityId: overrides.legalEntityId ?? 12,
    congregation: {
      name: overrides.name ?? 'Monte de Sión Cartagena',
      municipalityCode: '13001',
      address: 'Calle 1 # 2-3',
    },
    manager: {
      displayName: 'Laura Gómez',
      email: overrides.email ?? 'laura@iglesia.org',
      password: PASSWORD,
    },
  });

  const register = (body: unknown) =>
    call('POST', '/api/public/congregation-registrations', { payload: body });

  const login = (email: string, password = PASSWORD) =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });

  beforeAll(async () => {
    const adminAccount = (id: number, email: string, verified = true) =>
      accounts.add(
        buildAccount({
          id,
          email,
          emailVerifiedAt: verified ? new Date('2026-01-01') : null,
        }),
      );
    adminAccount(PLATFORM_ADMIN, 'plataforma@example.com');
    adminAccount(ADMIN_DENOMINATION_1, 'admin1@example.com');
    adminAccount(ADMIN_DENOMINATION_2, 'admin2@example.com');
    adminAccount(UNVERIFIED_PLATFORM_ADMIN, 'sinverificar@example.com', false);

    const platformRole = assignment(
      'PLATFORM_ADMIN',
      'PLATFORM',
      { denominationId: null, congregationId: null },
      ['denominations.manage', 'users.manage'],
    );
    access.set(PLATFORM_ADMIN, {
      userId: PLATFORM_ADMIN,
      isActive: true,
      assignments: [platformRole],
    });
    access.set(UNVERIFIED_PLATFORM_ADMIN, {
      userId: UNVERIFIED_PLATFORM_ADMIN,
      isActive: true,
      assignments: [platformRole],
    });
    for (const [userId, denominationId] of [
      [ADMIN_DENOMINATION_1, 1],
      [ADMIN_DENOMINATION_2, 2],
    ] as const) {
      access.set(userId, {
        userId,
        isActive: true,
        assignments: [
          assignment(
            'DENOMINATION_ADMIN',
            'DENOMINATION',
            { denominationId, congregationId: null },
            ['congregations.manage', 'users.manage'],
          ),
        ],
      });
    }

    publicWorld.legalEntities = [
      {
        id: 22,
        legalName: 'Corporación Dos',
        tradeName: 'Dos',
        taxId: '901.222.333-4',
        denominationId: 2,
        denominationName: 'Denominación Dos',
        countryId: COLOMBIA.id,
        countryName: COLOMBIA.name,
      },
      {
        id: 12,
        legalName: 'Corporación Uno',
        tradeName: null,
        taxId: '900.123.456-7',
        denominationId: 1,
        denominationName: 'Denominación Uno',
        countryId: COLOMBIA.id,
        countryName: COLOMBIA.name,
      },
    ];

    // What the database would hold after the transaction: the user, its roles and its link.
    registrationWorld.onRegistered = ({ userId, congregationId, command }) => {
      accounts.add(
        buildAccount({
          id: userId,
          email: command.manager.email,
          displayName: command.manager.displayName,
          passwordHash: command.manager.passwordHash,
          emailVerifiedAt: null,
        }),
      );
      userTokens.rows.push({
        id: 5000 + userId,
        userId,
        type: 'EMAIL_VERIFICATION',
        tokenHash: command.verification.tokenHash,
        expiresAt: command.verification.expiresAt,
        usedAt: null,
      });
      congregationDenomination.set(
        congregationId,
        command.congregation.denominationId,
      );
      access.set(userId, {
        userId,
        isActive: true,
        assignments: command.roleCodes.map((roleCode) =>
          assignment(
            roleCode,
            'CONGREGATION',
            {
              denominationId: command.congregation.denominationId,
              congregationId,
            },
            ['members.read'],
          ),
        ),
      });
    };

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: vi.fn() })
      .overrideProvider(RedisService)
      .useValue({ client: { ping: vi.fn() } })
      .overrideProvider(RATE_LIMITER)
      .useValue({
        consume: () => {
          if (limiter.mode === 'fail') {
            return Promise.reject(new Error('redis down'));
          }
          return Promise.resolve({
            allowed: limiter.mode === 'allow',
            retryAfterSeconds: 120,
          });
        },
        reset: () => Promise.resolve(),
      })
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new FakeHasher())
      .overrideProvider(MAILER)
      .useValue(mailer)
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(new ImmediateTransactionRunner())
      .overrideProvider(AUDIT_RECORDER)
      .useValue(audit)
      .overrideProvider(AUTH_ACCOUNT_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(REFRESH_TOKEN_REPOSITORY)
      .useValue(refreshTokens)
      .overrideProvider(USER_TOKEN_REPOSITORY)
      .useValue(userTokens)
      .overrideProvider(SESSION_PROFILE_READER)
      .useValue(sessionProfiles)
      .overrideProvider(SESSION_VALIDATOR)
      .useValue(sessionValidator)
      .overrideProvider(ASSIGNMENTS_READER)
      .useValue(reader)
      .overrideProvider(PUBLIC_DIRECTORY)
      .useValue(publicWorld)
      .overrideProvider(CONGREGATION_REGISTRATION_STORE)
      .useValue(registrationWorld)
      .overrideProvider(CONGREGATION_REPOSITORY)
      .useValue(new InMemoryCongregationRepository(organization))
      .overrideProvider(LEGAL_ENTITY_REPOSITORY)
      .useValue(new InMemoryLegalEntityRepository(organization))
      .overrideProvider(DISTRICT_REPOSITORY)
      .useValue(new InMemoryDistrictRepository(organization))
      .overrideProvider(GEO_REPOSITORY)
      .useValue(new InMemoryGeoRepository(organization))
      .overrideProvider(PLATFORM_LEGAL_ENTITY_READER)
      .useValue(new InMemoryPlatformLegalEntityReader(organization))
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
    limiter.mode = 'allow';
    mailer.sent.length = 0;
    mailer.isConfigured = true;
  });

  describe('GET /api/public/legal-entities', () => {
    it('is public and lists the legal entities with the NIT masked, never the full NIT', async () => {
      const response = await call('GET', '/api/public/legal-entities');

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual([
        {
          id: 22,
          legalName: 'Corporación Dos',
          tradeName: 'Dos',
          taxIdMasked: '***.***.**3-4',
          denominationId: 2,
          denominationName: 'Denominación Dos',
          countryId: COLOMBIA.id,
          countryName: 'Colombia',
        },
        {
          id: 12,
          legalName: 'Corporación Uno',
          tradeName: null,
          taxIdMasked: '***.***.**6-7',
          denominationId: 1,
          denominationName: 'Denominación Uno',
          countryId: COLOMBIA.id,
          countryName: 'Colombia',
        },
      ]);
      expect(response.body).not.toContain('900.123');
    });

    it('is rate limited per IP', async () => {
      limiter.mode = 'block';

      const response = await call('GET', '/api/public/legal-entities');

      expect(response.statusCode).toBe(429);
      expect(response.json()).toMatchObject({ code: 'RATE_LIMITED' });
    });

    it('stays open for a signed-in user whose e-mail is not confirmed', async () => {
      const response = await call('GET', '/api/public/legal-entities', {
        userId: UNVERIFIED_PLATFORM_ADMIN,
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /api/public/congregation-registrations', () => {
    it('answers 201 without a session and creates the congregation, the user and its roles in the legal entity denomination', async () => {
      const response = await register(registrationBody());

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        emailVerificationRequired: true,
        congregationName: 'Monte de Sión Cartagena',
      });
      const { command, userId, congregationId } =
        registrationWorld.registrations[0];
      expect(command.congregation.denominationId).toBe(1);
      expect(command.roleCodes).toEqual(['PASTOR', 'SECRETARY', 'TREASURER']);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]).toMatchObject({
        to: 'laura@iglesia.org',
        kind: 'EMAIL_VERIFICATION',
      });
      expect(
        audit.entries
          .filter((entry) => entry.actor.userId === userId)
          .map((entry) => entry.action),
      ).toEqual([
        'CONGREGATION_REGISTERED',
        'USER_REGISTERED',
        'ROLE_GRANTED',
        'ROLE_GRANTED',
        'ROLE_GRANTED',
      ]);
      expect(congregationId).toBeGreaterThan(0);
    });

    it('does not reveal whether the e-mail has an account: same status, same shape, no link in the notice', async () => {
      const started = Date.now();
      const fresh = await register(
        registrationBody({ name: 'Sede Nueva', email: 'nueva@iglesia.org' }),
      );
      const freshMs = Date.now() - started;
      const registrations = registrationWorld.registrations.length;
      mailer.sent.length = 0;

      const existingStart = Date.now();
      const existing = await register(
        registrationBody({
          name: 'Sede Para Existente',
          email: 'laura@iglesia.org',
        }),
      );
      const existingMs = Date.now() - existingStart;

      expect(existing.statusCode).toBe(fresh.statusCode);
      expect(Object.keys(existing.json<object>())).toEqual(
        Object.keys(fresh.json<object>()),
      );
      expect(existing.json()).toMatchObject({
        emailVerificationRequired: true,
        congregationName: 'Sede Para Existente',
      });
      // Nothing was created; the owner of the address is told, without links.
      expect(registrationWorld.registrations).toHaveLength(registrations);
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0]).toMatchObject({
        to: 'laura@iglesia.org',
        kind: 'REGISTRATION_NOTICE',
      });
      expect(mailer.sent[0].text).not.toMatch(/https?:\/\//);
      // Both take at least the same floor, so the time does not tell them apart.
      expect(freshMs).toBeGreaterThanOrEqual(750);
      expect(existingMs).toBeGreaterThanOrEqual(750);
    });

    it('returns devVerificationLink only without SMTP, and the link confirms the e-mail', async () => {
      mailer.isConfigured = false;

      const response = await register(
        registrationBody({ name: 'Sede Dev', email: 'dev@iglesia.org' }),
      );

      const { devVerificationLink } = response.json<{
        devVerificationLink?: string;
      }>();
      expect(devVerificationLink).toMatch(
        /^http:\/\/localhost:4200\/login\/verify-email\?token=[\w-]+$/,
      );
      const token = new URL(devVerificationLink as string).searchParams.get(
        'token',
      );
      const confirmed = await call(
        'POST',
        '/api/auth/email-verification/confirm',
        { payload: { token } },
      );
      expect(confirmed.statusCode).toBe(204);
    });

    it('answers 404 LEGAL_ENTITY_NOT_FOUND for an unknown or inactive legal entity', async () => {
      for (const legalEntityId of [999, 13, 32]) {
        const response = await register(registrationBody({ legalEntityId }));

        expect(response.statusCode).toBe(404);
        expect(response.json()).toMatchObject({
          code: 'LEGAL_ENTITY_NOT_FOUND',
        });
      }
    });

    it('requires the municipality and resolves it inside the country of the legal entity, whatever the e-mail', async () => {
      const registrations = registrationWorld.registrations.length;
      const withoutMunicipality = registrationBody({
        name: 'Sede Sin Municipio',
      });
      const missing = await register({
        ...withoutMunicipality,
        congregation: { name: 'Sede Sin Municipio', address: 'Calle 1' },
      });
      expect(missing.statusCode).toBe(400);

      // 1701 is a municipality of another country only.
      for (const email of ['otro@iglesia.org', 'laura@iglesia.org']) {
        const foreign = registrationBody({ name: 'Sede Exterior', email });
        const response = await register({
          ...foreign,
          congregation: { ...foreign.congregation, municipalityCode: '1701' },
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          code: 'MUNICIPALITY_COUNTRY_MISMATCH',
          message: 'El municipio no pertenece al país de la razón social.',
        });
      }
      expect(registrationWorld.registrations).toHaveLength(registrations);
      expect(mailer.sent).toHaveLength(0);
    });

    it('answers 409 DUPLICATE_NAME when the denomination already has that sede, whatever the e-mail', async () => {
      for (const email of ['otro@iglesia.org', 'laura@iglesia.org']) {
        const response = await register(
          registrationBody({ name: 'sede central', email }),
        );

        expect(response.statusCode).toBe(409);
        expect(response.json()).toMatchObject({ code: 'DUPLICATE_NAME' });
      }
    });

    it('answers 400 for a weak password, a malformed body and fields it does not know', async () => {
      const weak = await register({
        ...registrationBody({ name: 'Sede Débil', email: 'debil@iglesia.org' }),
        manager: {
          displayName: 'Laura Gómez',
          email: 'debil@iglesia.org',
          password: 'corta1',
        },
      });
      expect(weak.statusCode).toBe(400);
      expect(weak.json()).toMatchObject({ code: 'WEAK_PASSWORD' });

      for (const body of [
        {},
        { ...registrationBody(), manager: undefined },
        { ...registrationBody(), denominationId: 1 },
        {
          ...registrationBody(),
          manager: {
            displayName: 'Laura',
            email: 'no-es-correo',
            password: PASSWORD,
          },
        },
      ]) {
        const response = await register(body);

        expect(response.statusCode).toBe(400);
      }
    });

    it('is limited per IP, and closes with 503 when the counter store fails', async () => {
      limiter.mode = 'block';
      const blocked = await register(registrationBody());
      expect(blocked.statusCode).toBe(429);

      limiter.mode = 'fail';
      const closed = await register(registrationBody());
      expect(closed.statusCode).toBe(503);
      expect(mailer.sent).toHaveLength(0);
    });
  });

  describe('the journey of an unverified user', () => {
    const email = 'viaje@iglesia.org';
    let userId = 0;
    let congregationId = 0;
    let accessToken = '';
    let mailedToken = '';

    const authorized = (headers: Record<string, string> = {}) => ({
      authorization: `Bearer ${accessToken}`,
      ...headers,
    });

    it('registers and signs in right away: the session says the e-mail is not confirmed', async () => {
      await register(registrationBody({ name: 'Sede Viaje', email }));
      ({ userId, congregationId } = registrationWorld.registrations.at(-1) as {
        userId: number;
        congregationId: number;
      });

      const response = await login(email);

      expect(response.statusCode).toBe(200);
      const body = response.json<{
        accessToken: string;
        session: { emailVerified: boolean; assignments: unknown[] };
      }>();
      expect(body.session.emailVerified).toBe(false);
      accessToken = body.accessToken;
    });

    it('can use /auth/* (me, change-password) but every domain route answers 403 EMAIL_NOT_VERIFIED', async () => {
      const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: authorized(),
      });
      expect(me.statusCode).toBe(200);
      expect(me.json()).toMatchObject({ emailVerified: false });

      // It passes the e-mail rule and reaches the use case, which rejects the wrong current password.
      const change = await app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        headers: authorized(),
        payload: { currentPassword: 'equivocada-1', newPassword: PASSWORD },
      });
      expect(change.statusCode).toBe(400);
      expect(change.json()).toMatchObject({ code: 'INVALID_CURRENT_PASSWORD' });

      for (const url of [
        '/api/congregations/selectable',
        '/api/organization/legal-entities',
        '/api/catalogs',
      ]) {
        const blocked = await app.inject({
          method: 'GET',
          url,
          headers: authorized({ 'x-scope': `C:${congregationId}` }),
        });

        expect(blocked.statusCode).toBe(403);
        expect(blocked.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
      }
    });

    it('closes platform routes to an unverified user whatever the permissions are', async () => {
      const response = await call('GET', '/api/platform/legal-entities', {
        userId: UNVERIFIED_PLATFORM_ADMIN,
        scope: 'P',
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({ code: 'EMAIL_NOT_VERIFIED' });
    });

    it('asks for a new link: 202 always, the old one stops working', async () => {
      const firstToken = userTokens.rows.find((r) => r.userId === userId);
      mailer.sent.length = 0;

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/email-verification/resend',
        headers: authorized(),
      });

      expect(response.statusCode).toBe(202);
      expect(firstToken?.usedAt).not.toBeNull();
      expect(mailer.sent).toHaveLength(1);
      expect(mailer.sent[0].kind).toBe('EMAIL_VERIFICATION');
      mailedToken = /token=([\w-]+)/.exec(mailer.sent[0].text)?.[1] as string;
      // SMTP is configured here: the link travels only by e-mail.
      expect(response.body).not.toContain('token=');
    });

    it('needs a session to ask for a new link', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/email-verification/resend',
      });

      expect(response.statusCode).toBe(401);
    });

    it('is limited when asking for new links', async () => {
      limiter.mode = 'block';

      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/email-verification/resend',
        headers: authorized(),
      });

      expect(response.statusCode).toBe(429);
    });

    it('confirms the e-mail with the mailed link (204), once, and the domain routes open', async () => {
      const link = mailedToken;

      const confirmed = await call(
        'POST',
        '/api/auth/email-verification/confirm',
        { payload: { token: link } },
      );
      const replay = await call(
        'POST',
        '/api/auth/email-verification/confirm',
        { payload: { token: link } },
      );

      expect(confirmed.statusCode).toBe(204);
      expect(replay.statusCode).toBe(400);
      expect(replay.json()).toMatchObject({ code: 'TOKEN_INVALID_OR_EXPIRED' });

      const opened = await app.inject({
        method: 'GET',
        url: '/api/congregations/selectable',
        headers: authorized({ 'x-scope': `C:${congregationId}` }),
      });
      expect(opened.statusCode).toBe(200);
      const me = await app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: authorized(),
      });
      expect(me.json()).toMatchObject({ emailVerified: true });
    });

    it('refuses a malformed or unknown token on confirm', async () => {
      for (const token of ['corto', 'a'.repeat(43)]) {
        const response = await call(
          'POST',
          '/api/auth/email-verification/confirm',
          { payload: { token } },
        );

        expect(response.statusCode).toBe(400);
      }
      const missing = await call(
        'POST',
        '/api/auth/email-verification/confirm',
        { payload: {} },
      );
      expect(missing.statusCode).toBe(400);
    });
  });

  describe('platform legal entities', () => {
    const body = (overrides: Record<string, unknown> = {}) => ({
      denominationId: 2,
      legalName: 'Corporación Nueva',
      tradeName: 'Nueva',
      taxId: '902111222-3',
      legalRepresentative: 'Representante Legal',
      countryId: COLOMBIA.id,
      municipalityCode: '13001',
      email: 'Contacto@Nueva.org',
      ...overrides,
    });
    let createdId = 0;

    it('needs a session and the denominations.manage permission at platform scope', async () => {
      const anonymous = await call('GET', '/api/platform/legal-entities');
      expect(anonymous.statusCode).toBe(401);

      // A denomination administrator has no platform permission, and cannot ask for the platform scope.
      const noPermission = await call('GET', '/api/platform/legal-entities', {
        userId: ADMIN_DENOMINATION_1,
        scope: 'D:1',
      });
      expect(noPermission.statusCode).toBe(403);
      const wrongScope = await call('GET', '/api/platform/legal-entities', {
        userId: ADMIN_DENOMINATION_1,
        scope: 'P',
      });
      expect(wrongScope.statusCode).toBe(403);
      expect(wrongScope.json()).toMatchObject({ code: 'SCOPE_FORBIDDEN' });
      const write = await call('POST', '/api/platform/legal-entities', {
        userId: ADMIN_DENOMINATION_1,
        scope: 'D:1',
        payload: body({ denominationId: 1 }),
      });
      expect(write.statusCode).toBe(403);
    });

    it('lists the legal entities of every denomination with its name and congregation count, or of one', async () => {
      const all = await call('GET', '/api/platform/legal-entities', {
        userId: PLATFORM_ADMIN,
        scope: 'P',
      });
      expect(all.statusCode).toBe(200);
      expect(all.json<{ id: number }[]>().map((row) => row.id)).toEqual([
        entity2.id,
        entity1.id,
      ]);
      expect(
        all
          .json<{ id: number; congregationCount: number }[]>()
          .find((row) => row.id === entity1.id),
      ).toMatchObject({
        denominationName: 'Denominación Uno',
        congregationCount: 1,
      });

      const one = await call(
        'GET',
        '/api/platform/legal-entities?denominationId=2',
        { userId: PLATFORM_ADMIN, scope: 'P' },
      );
      expect(one.json<{ id: number }[]>().map((row) => row.id)).toEqual([
        entity2.id,
      ]);

      const invalid = await call(
        'GET',
        '/api/platform/legal-entities?denominationId=abc',
        { userId: PLATFORM_ADMIN, scope: 'P' },
      );
      expect(invalid.statusCode).toBe(400);
    });

    it('creates a legal entity for a denomination that has no administrator user, and audits it', async () => {
      const response = await call('POST', '/api/platform/legal-entities', {
        userId: PLATFORM_ADMIN,
        scope: 'P',
        payload: body(),
      });

      expect(response.statusCode).toBe(201);
      const created = response.json<{ id: number }>();
      createdId = created.id;
      expect(created).toMatchObject({
        denominationId: 2,
        denominationName: 'Denominación Dos',
        countryId: COLOMBIA.id,
        countryName: 'Colombia',
        municipalityCode: '13001',
        taxId: '902.111.222-3',
        email: 'contacto@nueva.org',
        isActive: true,
        congregationCount: 0,
      });
      expect(audit.entries.at(-1)).toMatchObject({
        action: 'CREATE',
        entity: 'LegalEntity',
        entityId: createdId,
        denominationId: 2,
        actor: { userId: PLATFORM_ADMIN },
      });
    });

    it('answers 409 DUPLICATE_TAX_ID with a clear message, 404 for an unknown denomination and 400 for bad data', async () => {
      const duplicate = await call('POST', '/api/platform/legal-entities', {
        userId: PLATFORM_ADMIN,
        scope: 'P',
        payload: body({ denominationId: 1, taxId: '902.111.222-3' }),
      });
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({
        code: 'DUPLICATE_TAX_ID',
        message: 'Ya existe una razón social registrada con ese NIT.',
      });

      const unknown = await call('POST', '/api/platform/legal-entities', {
        userId: PLATFORM_ADMIN,
        scope: 'P',
        payload: body({ denominationId: 99, taxId: '903.111.222-1' }),
      });
      expect(unknown.statusCode).toBe(404);

      for (const payload of [
        {},
        body({ denominationId: undefined }),
        body({ countryId: undefined }),
        body({ countryId: 'CO' }),
        body({ taxId: '12345' }),
        body({ municipalityCode: 'Cartagena' }),
        body({ legalRepresentative: '' }),
      ]) {
        const invalidResponse = await call(
          'POST',
          '/api/platform/legal-entities',
          { userId: PLATFORM_ADMIN, scope: 'P', payload },
        );
        expect(invalidResponse.statusCode).toBe(400);
      }
    });

    it('answers 404 COUNTRY_NOT_FOUND and 400 MUNICIPALITY_COUNTRY_MISMATCH on create', async () => {
      const unknownCountry = await call(
        'POST',
        '/api/platform/legal-entities',
        {
          userId: PLATFORM_ADMIN,
          scope: 'P',
          payload: body({ countryId: 9999, taxId: '904.111.222-1' }),
        },
      );
      expect(unknownCountry.statusCode).toBe(404);
      expect(unknownCountry.json()).toMatchObject({
        code: 'COUNTRY_NOT_FOUND',
      });

      const mismatch = await call('POST', '/api/platform/legal-entities', {
        userId: PLATFORM_ADMIN,
        scope: 'P',
        payload: body({
          countryId: OTHER_COUNTRY.id,
          municipalityCode: '11001',
          taxId: '904.111.222-1',
        }),
      });
      expect(mismatch.statusCode).toBe(400);
      expect(mismatch.json()).toMatchObject({
        code: 'MUNICIPALITY_COUNTRY_MISMATCH',
        message: 'El municipio no pertenece al país de la razón social.',
      });
    });

    it('is visible only to its own denomination and to nobody else (tenant isolation intact)', async () => {
      const ownList = await call('GET', '/api/organization/legal-entities', {
        userId: ADMIN_DENOMINATION_2,
        scope: 'D:2',
      });
      expect(ownList.json<{ id: number }[]>().map((row) => row.id)).toContain(
        createdId,
      );

      const foreignList = await call(
        'GET',
        '/api/organization/legal-entities',
        { userId: ADMIN_DENOMINATION_1, scope: 'D:1' },
      );
      expect(
        foreignList.json<{ id: number }[]>().map((row) => row.id),
      ).not.toContain(createdId);

      // A denomination administrator cannot reach the platform edit route, whatever the id is.
      const foreignEdit = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}`,
        {
          userId: ADMIN_DENOMINATION_1,
          scope: 'D:1',
          payload: { legalName: 'Intento' },
        },
      );
      expect(foreignEdit.statusCode).toBe(403);
    });

    it('edits only the fields that are sent and refuses a NIT of another entity', async () => {
      const response = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}`,
        {
          userId: PLATFORM_ADMIN,
          scope: 'P',
          payload: { legalName: 'Corporación Renombrada' },
        },
      );
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        legalName: 'Corporación Renombrada',
        tradeName: 'Nueva',
        taxId: '902.111.222-3',
        denominationId: 2,
      });

      const duplicate = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}`,
        {
          userId: PLATFORM_ADMIN,
          scope: 'P',
          payload: { taxId: entity1.taxId },
        },
      );
      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json()).toMatchObject({ code: 'DUPLICATE_TAX_ID' });

      const unknown = await call('PATCH', '/api/platform/legal-entities/9999', {
        userId: PLATFORM_ADMIN,
        scope: 'P',
        payload: { legalName: 'x' },
      });
      expect(unknown.statusCode).toBe(404);

      const moved = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}`,
        {
          userId: PLATFORM_ADMIN,
          scope: 'P',
          payload: { denominationId: 1 },
        },
      );
      expect(moved.statusCode).toBe(400);
    });

    it('changes the country only with a municipality of the new country (or null) and never with sedes', async () => {
      const kept = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}`,
        {
          userId: PLATFORM_ADMIN,
          scope: 'P',
          payload: { countryId: OTHER_COUNTRY.id },
        },
      );
      expect(kept.statusCode).toBe(400);
      expect(kept.json()).toMatchObject({
        code: 'MUNICIPALITY_COUNTRY_MISMATCH',
      });

      const moved = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}`,
        {
          userId: PLATFORM_ADMIN,
          scope: 'P',
          payload: { countryId: OTHER_COUNTRY.id, municipalityCode: null },
        },
      );
      expect(moved.statusCode).toBe(200);
      expect(moved.json()).toMatchObject({
        countryId: OTHER_COUNTRY.id,
        countryName: OTHER_COUNTRY.name,
        municipalityCode: null,
      });

      const withSedes = await call(
        'PATCH',
        `/api/platform/legal-entities/${entity1.id}`,
        {
          userId: PLATFORM_ADMIN,
          scope: 'P',
          payload: { countryId: OTHER_COUNTRY.id, municipalityCode: null },
        },
      );
      expect(withSedes.statusCode).toBe(409);
      expect(withSedes.json()).toMatchObject({
        code: 'LEGAL_ENTITY_HAS_CONGREGATIONS',
      });
    });

    it('deactivates an entity without sedes and refuses one with active sedes', async () => {
      const blocked = await call(
        'PATCH',
        `/api/platform/legal-entities/${entity1.id}/status`,
        { userId: PLATFORM_ADMIN, scope: 'P', payload: { isActive: false } },
      );
      expect(blocked.statusCode).toBe(409);
      expect(blocked.json()).toMatchObject({ code: 'LEGAL_ENTITY_IN_USE' });

      const off = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}/status`,
        { userId: PLATFORM_ADMIN, scope: 'P', payload: { isActive: false } },
      );
      expect(off.statusCode).toBe(200);
      expect(off.json()).toMatchObject({ isActive: false });
      expect(audit.entries.at(-1)).toMatchObject({
        action: 'DEACTIVATE',
        denominationId: 2,
      });

      const invalid = await call(
        'PATCH',
        `/api/platform/legal-entities/${createdId}/status`,
        { userId: PLATFORM_ADMIN, scope: 'P', payload: { isActive: 'no' } },
      );
      expect(invalid.statusCode).toBe(400);
    });
  });
});
