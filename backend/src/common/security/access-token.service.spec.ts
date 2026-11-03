import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { UnauthenticatedException } from '../errors/domain.exception.js';
import { AccessTokenService } from './access-token.service.js';

const SECRET = 'unit-test-secret-with-at-least-32-characters';

function createService(secret = SECRET, expiration = '15m') {
  const config = {
    get: (key: string) => (key === 'JWT_EXPIRATION' ? expiration : undefined),
  } as unknown as ConfigService<never, true>;
  return {
    service: new AccessTokenService(new JwtService({ secret }), config),
    jwt: new JwtService({ secret }),
  };
}

describe('AccessTokenService', () => {
  it('signs a token that carries only the user and the session', async () => {
    const { service, jwt } = createService();

    const { token, expiresInSeconds } = await service.sign({
      userId: 42,
      sessionId: 'family-1',
    });

    expect(expiresInSeconds).toBe(900);
    const payload = await jwt.verifyAsync<Record<string, unknown>>(token);
    expect(Object.keys(payload).sort()).toEqual(['exp', 'iat', 'sid', 'sub']);
    expect(payload.sub).toBe('42');
  });

  it('verifies a valid token back to the principal', async () => {
    const { service } = createService();
    const { token } = await service.sign({ userId: 42, sessionId: 'family-1' });

    await expect(service.verify(token)).resolves.toEqual({
      userId: 42,
      sessionId: 'family-1',
    });
  });

  it('rejects a token signed with another secret', async () => {
    const { token } = await createService(
      'another-secret-with-at-least-32-chars!',
    ).service.sign({
      userId: 1,
      sessionId: 's',
    });

    await expect(createService().service.verify(token)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('rejects an expired token', async () => {
    const { service, jwt } = createService();
    const expired = await jwt.signAsync(
      { sub: '1', sid: 's' },
      { expiresIn: -10 },
    );

    await expect(service.verify(expired)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('rejects an unsigned token (alg none)', async () => {
    const { service } = createService();
    const header = Buffer.from('{"alg":"none","typ":"JWT"}').toString(
      'base64url',
    );
    const body = Buffer.from('{"sub":"1","sid":"s"}').toString('base64url');

    await expect(service.verify(`${header}.${body}.`)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it.each([
    [{ sid: 's' }],
    [{ sub: '1' }],
    [{ sub: 'abc', sid: 's' }],
    [{ sub: '0', sid: 's' }],
    [{ sub: 1, sid: 's' }],
    [{ sub: '1', sid: '' }],
  ])('rejects a payload that is not ours: %o', async (payload) => {
    const { service, jwt } = createService();
    const token = await jwt.signAsync(payload);

    await expect(service.verify(token)).rejects.toBeInstanceOf(
      UnauthenticatedException,
    );
  });

  it('rejects garbage', async () => {
    await expect(
      createService().service.verify('not-a-token'),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });
});
