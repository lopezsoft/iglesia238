import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ForbiddenDomainException,
  InvalidInputException,
  UnauthenticatedException,
} from '../errors/domain.exception.js';
import { TenantContextResolver } from '../tenancy/tenant-context.resolver.js';
import { buildTenantContext } from '../../../test/support/tenants.js';
import { AccessTokenService } from './access-token.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from './permissions.decorator.js';
import { PermissionsGuard } from './permissions.guard.js';
import type { SessionValidator } from './session-validator.port.js';
import { FixedClock } from '../../../test/support/foundation-fakes.js';
import { Public } from './public.decorator.js';
import { AuthenticatedRequest, Principal } from './request-context.js';

class Handlers {
  open(): void {}

  @Public()
  publicRoute(): void {}

  @RequirePermissions('members.read', 'members.write')
  needsBoth(): void {}

  @RequireAnyPermission('reports.read', 'contributions.read')
  needsOne(): void {}
}

function contextFor(handler: keyof Handlers, request: AuthenticatedRequest) {
  return {
    getHandler: () =>
      (Handlers.prototype as unknown as Record<string, () => void>)[handler],
    getClass: () => Handlers,
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const request = (
  headers: AuthenticatedRequest['headers'] = {},
  extra: Partial<AuthenticatedRequest> = {},
): AuthenticatedRequest => ({ headers, ...extra });

describe('JwtAuthGuard', () => {
  // A plain function: a vi.fn() that returns a rejected promise is reported as an unhandled rejection.
  let outcome: () => Promise<Principal> = () =>
    Promise.reject(new Error('unset'));
  const verify = vi.fn(() => outcome());
  const isActive = vi.fn<SessionValidator['isActive']>(() =>
    Promise.resolve(true),
  );
  const sessions: SessionValidator = { isActive };
  const guard = new JwtAuthGuard(
    new Reflector(),
    { verify } as unknown as AccessTokenService,
    sessions,
    new FixedClock(),
  );

  beforeEach(() => {
    verify.mockClear();
    isActive.mockClear();
    isActive.mockResolvedValue(true);
    outcome = () => Promise.reject(new Error('unset'));
  });

  it('lets a @Public() route through without looking at the token', async () => {
    await expect(
      guard.canActivate(contextFor('publicRoute', request())),
    ).resolves.toBe(true);
    expect(verify).not.toHaveBeenCalled();
  });

  it('is closed by default: a route without decorators needs a token', async () => {
    await expect(
      guard.canActivate(contextFor('open', request())),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });

  it.each(['Basic abc', 'Bearer', 'Bearer a b', 'bearer abc', 'Token abc'])(
    'rejects the authorization header %j',
    async (header) => {
      await expect(
        guard.canActivate(
          contextFor('open', request({ authorization: header })),
        ),
      ).rejects.toBeInstanceOf(UnauthenticatedException);
    },
  );

  it('attaches the principal of a valid token', async () => {
    outcome = () => Promise.resolve({ userId: 3, sessionId: 's' });
    const req = request({ authorization: 'Bearer aaa.bbb.ccc' });

    await expect(guard.canActivate(contextFor('open', req))).resolves.toBe(
      true,
    );

    expect(verify).toHaveBeenCalledWith('aaa.bbb.ccc');
    expect(req.principal).toEqual({ userId: 3, sessionId: 's' });
  });

  it('rejects a validly signed token whose session was closed (logout, password change, theft)', async () => {
    outcome = () => Promise.resolve({ userId: 3, sessionId: 'closed' });
    isActive.mockResolvedValue(false);
    const req = request({ authorization: 'Bearer aaa.bbb.ccc' });

    await expect(
      guard.canActivate(contextFor('open', req)),
    ).rejects.toBeInstanceOf(UnauthenticatedException);

    expect(isActive).toHaveBeenCalledWith(
      3,
      'closed',
      new Date('2026-11-02T15:00:00.000Z'),
    );
    expect(req.principal).toBeUndefined();
  });

  it('does not look the session up for a @Public() route', async () => {
    await guard.canActivate(contextFor('publicRoute', request()));

    expect(isActive).not.toHaveBeenCalled();
  });

  it('propagates the rejection of an invalid token', async () => {
    outcome = () => Promise.reject(new UnauthenticatedException());

    await expect(
      guard.canActivate(
        contextFor('open', request({ authorization: 'Bearer x.y.z' })),
      ),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });
});

describe('PermissionsGuard', () => {
  const resolve = vi.fn();
  const guard = new PermissionsGuard(new Reflector(), {
    resolve,
  } as unknown as TenantContextResolver);
  const principal = { userId: 7, sessionId: 'sid' };

  beforeEach(() => resolve.mockReset());

  it('skips @Public() routes', async () => {
    await expect(
      guard.canActivate(contextFor('publicRoute', request())),
    ).resolves.toBe(true);
  });

  it('requires a principal on every other route', async () => {
    await expect(
      guard.canActivate(contextFor('open', request())),
    ).rejects.toBeInstanceOf(UnauthenticatedException);
  });

  it('lets an authenticated route without permissions through when there is no scope', async () => {
    const req = request({}, { principal });

    await expect(guard.canActivate(contextFor('open', req))).resolves.toBe(
      true,
    );
    expect(resolve).not.toHaveBeenCalled();
    expect(req.tenant).toBeUndefined();
  });

  it('validates and exposes the scope even on a route without permissions', async () => {
    const tenant = buildTenantContext();
    resolve.mockResolvedValue(tenant);
    const req = request({ 'x-scope': 'C:10' }, { principal });

    await guard.canActivate(contextFor('open', req));

    expect(resolve).toHaveBeenCalledWith({
      userId: 7,
      sessionId: 'sid',
      rawScope: 'C:10',
    });
    expect(req.tenant).toBe(tenant);
  });

  it('answers 400 SCOPE_REQUIRED when a route needs permissions and the scope is missing', async () => {
    const error = await guard
      .canActivate(contextFor('needsBoth', request({}, { principal })))
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(InvalidInputException);
    expect((error as InvalidInputException).code).toBe('SCOPE_REQUIRED');
  });

  it('requires ALL the permissions of @RequirePermissions', async () => {
    resolve.mockResolvedValue(
      buildTenantContext({ permissions: ['members.read'] }),
    );

    await expect(
      guard.canActivate(
        contextFor('needsBoth', request({ 'x-scope': 'C:10' }, { principal })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);

    resolve.mockResolvedValue(
      buildTenantContext({ permissions: ['members.read', 'members.write'] }),
    );
    await expect(
      guard.canActivate(
        contextFor('needsBoth', request({ 'x-scope': 'C:10' }, { principal })),
      ),
    ).resolves.toBe(true);
  });

  it('requires ANY permission of @RequireAnyPermission', async () => {
    resolve.mockResolvedValue(
      buildTenantContext({ permissions: ['members.read'] }),
    );
    await expect(
      guard.canActivate(
        contextFor('needsOne', request({ 'x-scope': 'C:10' }, { principal })),
      ),
    ).rejects.toBeInstanceOf(ForbiddenDomainException);

    resolve.mockResolvedValue(
      buildTenantContext({ permissions: ['contributions.read'] }),
    );
    await expect(
      guard.canActivate(
        contextFor('needsOne', request({ 'x-scope': 'C:10' }, { principal })),
      ),
    ).resolves.toBe(true);
  });

  it('takes the first value when the header is repeated', async () => {
    resolve.mockResolvedValue(buildTenantContext());

    await guard.canActivate(
      contextFor(
        'open',
        request({ 'x-scope': ['C:10', 'C:11'] }, { principal }),
      ),
    );

    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({ rawScope: 'C:10' }),
    );
  });
});
