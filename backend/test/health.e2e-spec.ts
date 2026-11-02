import {
  FastifyAdapter,
  NestFastifyApplication,
} from '@nestjs/platform-fastify';
import { Test } from '@nestjs/testing';
import { AppModule } from '../src/app.module.js';
import { configureApp } from '../src/bootstrap/configure-app.js';
import { PrismaService } from '../src/infrastructure/prisma/prisma.service.js';
import { RedisService } from '../src/infrastructure/redis/redis.service.js';
import { ErrorProbeModule } from './error-probe.controller.js';

describe('Health API and error handling', () => {
  let app: NestFastifyApplication;
  const queryRaw = vi.fn();
  const ping = vi.fn();

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, ErrorProbeModule],
    })
      .overrideProvider(PrismaService)
      .useValue({ $queryRaw: queryRaw })
      .overrideProvider(RedisService)
      .useValue({ client: { ping } })
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

  it('GET /api/health only reveals the status', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });

  it('GET /api/health/ready returns 200 when dependencies respond', async () => {
    queryRaw.mockResolvedValueOnce([1]);
    ping.mockResolvedValueOnce('PONG');

    const response = await app.inject({
      method: 'GET',
      url: '/api/health/ready',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      checks: { database: 'up', redis: 'up' },
    });
  });

  it('GET /api/health/ready returns 503 when a dependency fails', async () => {
    queryRaw.mockRejectedValueOnce(new Error('connection refused'));
    ping.mockResolvedValueOnce('PONG');

    const response = await app.inject({
      method: 'GET',
      url: '/api/health/ready',
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ status: 'unavailable' });
    expect(response.body).not.toContain('connection refused');
  });

  it('uses the single error format and drops the query string', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/unknown?document=123',
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      statusCode: 404,
      path: '/api/unknown',
    });
    expect(response.body).not.toContain('123');
  });

  it.each([
    ['/api/test-errors/duplicate', 409],
    ['/api/test-errors/missing', 404],
  ])('translates database errors: %s returns %i', async (url, status) => {
    const response = await app.inject({ method: 'GET', url });

    expect(response.statusCode).toBe(status);
    expect(response.body).not.toContain('email');
  });

  it('hides the detail of server errors', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/test-errors/server-error',
    });

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain('internal detail');
  });

  it('does not publish Swagger unless it is enabled', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs' });

    expect(response.statusCode).toBe(404);
  });

  it('sends security headers', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/health' });

    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['content-security-policy']).toContain(
      "default-src 'none'",
    );
  });
});
