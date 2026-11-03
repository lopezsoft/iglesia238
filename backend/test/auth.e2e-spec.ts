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
import { PASSWORD_HASHER } from '../src/common/security/password-hasher.port.js';
import { SESSION_VALIDATOR } from '../src/common/security/session-validator.port.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { AUTH_ACCOUNT_REPOSITORY } from '../src/modules/auth/application/ports/auth-account.repository.js';
import { REFRESH_TOKEN_REPOSITORY } from '../src/modules/auth/application/ports/refresh-token.repository.js';
import { SESSION_PROFILE_READER } from '../src/modules/auth/application/ports/session-profile.reader.js';
import { USER_TOKEN_REPOSITORY } from '../src/modules/auth/application/ports/user-token.repository.js';
import {
  buildAccount,
  buildSession,
  FakeAccounts,
  FakeAudit,
  FakeHasher,
  FakeMailer,
  FakeRefreshTokens,
  FakeSessions,
  FakeTransactionRunner,
  FakeUserTokens,
} from '../src/modules/auth/application/testing/auth-fakes.js';

const PASSWORD = 'Clave-segura-2026';
const AJAX = { 'x-requested-with': 'XMLHttpRequest' };

describe('Auth endpoints', () => {
  let app: NestFastifyApplication;
  const accounts = new FakeAccounts();
  const sessions = new FakeSessions();
  const mailer = new FakeMailer();
  const refreshTokens = new FakeRefreshTokens();

  beforeAll(async () => {
    accounts.add(buildAccount());
    sessions.set(buildSession(1));

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
      .overrideProvider(PASSWORD_HASHER)
      .useValue(new FakeHasher())
      .overrideProvider(AUTH_ACCOUNT_REPOSITORY)
      .useValue(accounts)
      .overrideProvider(REFRESH_TOKEN_REPOSITORY)
      .useValue(refreshTokens)
      .overrideProvider(SESSION_VALIDATOR)
      .useValue(refreshTokens)
      .overrideProvider(USER_TOKEN_REPOSITORY)
      .useValue(new FakeUserTokens())
      .overrideProvider(SESSION_PROFILE_READER)
      .useValue(sessions)
      .overrideProvider(TRANSACTION_RUNNER)
      .useValue(new FakeTransactionRunner())
      .overrideProvider(AUDIT_RECORDER)
      .useValue(new FakeAudit())
      .overrideProvider(MAILER)
      .useValue(mailer)
      .compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await configureApp(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  afterAll(async () => {
    await app.close();
  });

  const login = (password = PASSWORD, email = 'laura@iglesia.org') =>
    app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email, password },
    });

  it('signs in: token and session in the body, refresh token only in an HttpOnly cookie', async () => {
    const response = await login();

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      accessToken: string;
      expiresIn: number;
      session: { assignments: unknown[] };
    }>();
    expect(body.accessToken.split('.')).toHaveLength(3);
    expect(body.expiresIn).toBe(900);
    expect(body.session.assignments).toHaveLength(1);

    const cookie = response.cookies.find((c) => c.name === 'refresh_token');
    expect(cookie).toMatchObject({
      httpOnly: true,
      sameSite: 'Strict',
      path: '/api/auth',
    });
    expect(cookie?.maxAge).toBe(7 * 24 * 3600);
    expect(response.body).not.toContain(cookie?.value);
  });

  it('answers 401 INVALID_CREDENTIALS with the same text for a wrong password and an unknown email', async () => {
    const wrong = await login('equivocada-1');
    const unknown = await login(PASSWORD, 'nadie@iglesia.org');

    expect(wrong.statusCode).toBe(401);
    expect(wrong.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
    expect(unknown.json()).toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: wrong.json<{ message: string }>().message,
    });
  });

  it('locks the account after five wrong passwords but keeps answering 401 INVALID_CREDENTIALS', async () => {
    accounts.add(buildAccount({ id: 9, email: 'bloqueo@iglesia.org' }));

    let response = await login('mala-1', 'bloqueo@iglesia.org');
    for (let attempt = 1; attempt <= 5; attempt++) {
      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
      response = await login('mala-1', 'bloqueo@iglesia.org');
    }

    // Locked now, yet indistinguishable from an unknown address: no 423, no Retry-After.
    expect(response.statusCode).toBe(401);
    expect(response.headers['retry-after']).toBeUndefined();
    // Even the right password is refused while the lock lasts.
    const locked = await login(PASSWORD, 'bloqueo@iglesia.org');
    expect(locked.statusCode).toBe(401);
    expect(locked.json()).toMatchObject({ code: 'INVALID_CREDENTIALS' });
  });

  it('answers 400 with Spanish messages for an invalid body', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'no-es-correo', password: '' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json<{ message: string[] }>().message).toContain(
      'Escribe un correo válido.',
    );
  });

  it('serves the session at /auth/me only with a token', async () => {
    const { accessToken } = (await login()).json<{ accessToken: string }>();

    expect(
      (await app.inject({ method: 'GET', url: '/api/auth/me' })).statusCode,
    ).toBe(401);
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: { authorization: `Bearer ${accessToken}` },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      id: 1,
      email: 'laura@iglesia.org',
    });
  });

  it('refuses to refresh without the X-Requested-With header', async () => {
    const cookie = (await login()).cookies.find(
      (c) => c.name === 'refresh_token',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      cookies: { refresh_token: cookie?.value ?? '' },
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({ code: 'CSRF_HEADER_REQUIRED' });
  });

  it('rotates the refresh cookie and returns the session in the same trip', async () => {
    const first = (await login()).cookies.find(
      (c) => c.name === 'refresh_token',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: AJAX,
      cookies: { refresh_token: first?.value ?? '' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ session: { id: 1 } });
    const second = response.cookies.find((c) => c.name === 'refresh_token');
    expect(second?.value).toBeTruthy();
    expect(second?.value).not.toBe(first?.value);
  });

  it('answers 401 to a refresh without a cookie', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: AJAX,
    });

    expect(response.statusCode).toBe(401);
  });

  it('logs out: 204, the session is revoked and the cookie is cleared', async () => {
    const cookie = (await login()).cookies.find(
      (c) => c.name === 'refresh_token',
    );

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: AJAX,
      cookies: { refresh_token: cookie?.value ?? '' },
    });

    expect(response.statusCode).toBe(204);
    expect(
      response.cookies.find((c) => c.name === 'refresh_token')?.value,
    ).toBe('');
    const refresh = await app.inject({
      method: 'POST',
      url: '/api/auth/refresh',
      headers: AJAX,
      cookies: { refresh_token: cookie?.value ?? '' },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('closes the access token of a session the moment it logs out', async () => {
    const signedIn = await login();
    const { accessToken } = signedIn.json<{ accessToken: string }>();
    const cookie = signedIn.cookies.find((c) => c.name === 'refresh_token');
    const me = () =>
      app.inject({
        method: 'GET',
        url: '/api/auth/me',
        headers: { authorization: `Bearer ${accessToken}` },
      });
    expect((await me()).statusCode).toBe(200);

    await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: AJAX,
      cookies: { refresh_token: cookie?.value ?? '' },
    });

    expect((await me()).statusCode).toBe(401);
  });

  it('answers 202 to a password reset request whether the account exists or not', async () => {
    mailer.sent.length = 0;

    const known = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'laura@iglesia.org' },
    });
    const unknown = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/request',
      payload: { email: 'nadie@iglesia.org' },
    });

    expect(known.statusCode).toBe(202);
    expect(unknown.statusCode).toBe(202);
    expect(known.body).toBe(unknown.body);
    expect(mailer.sent).toHaveLength(1);
  });

  it('answers 404 INVITATION_INVALID for a link that does not exist', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/invitations/lookup',
      payload: { token: 'token-que-no-existe-0000000000' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: 'INVITATION_INVALID' });
  });

  it('no longer accepts the invitation token in the URL path', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/auth/invitations/token-que-no-existe-0000000000',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).not.toMatchObject({ code: 'INVITATION_INVALID' });
  });

  it('answers 400 when the recovery token has an impossible shape', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/password-reset/confirm',
      payload: { token: 'x', newPassword: 'Nueva-clave-2027' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('requires authentication to change the password', async () => {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: { currentPassword: PASSWORD, newPassword: 'Nueva-clave-2027' },
    });

    expect(response.statusCode).toBe(401);
  });
});
