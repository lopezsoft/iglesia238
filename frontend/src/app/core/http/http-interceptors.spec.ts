import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { Scope } from '../auth/session.model';
import { DomainError } from '../errors/domain-error';
import { AccessTokenStore } from './access-token.store';
import { authInterceptor } from './auth.interceptor';
import { errorInterceptor } from './error.interceptor';
import { scopeInterceptor } from './scope.interceptor';

const congregation: Scope = { kind: 'CONGREGATION', denominationId: 4, congregationId: 9, label: 'Sede Norte' };

function setup(scope: Scope | null = congregation) {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(withInterceptors([errorInterceptor, authInterceptor, scopeInterceptor])),
      provideHttpClientTesting(),
      { provide: AuthService, useValue: { activeScope: () => scope } },
    ],
  });
  return {
    http: TestBed.inject(HttpClient),
    backend: TestBed.inject(HttpTestingController),
    tokens: TestBed.inject(AccessTokenStore),
  };
}

describe('API interceptors', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('sends the bearer token, the scope header and the requested-with header on domain calls', () => {
    const { http, backend, tokens } = setup();
    tokens.set('access-1');

    http.get('/api/members').subscribe();
    const request = backend.expectOne('/api/members');

    expect(request.request.headers.get('Authorization')).toBe('Bearer access-1');
    expect(request.request.headers.get('X-Scope')).toBe('C:9');
    expect(request.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    expect(request.request.withCredentials).toBe(true);
    request.flush([]);
  });

  it('sends the platform scope as P and omits the header on auth and public calls', () => {
    const { http, backend } = setup({ kind: 'PLATFORM', denominationId: null, congregationId: null, label: 'Plataforma' });

    http.get('/api/denominations').subscribe();
    expect(backend.expectOne('/api/denominations').request.headers.get('X-Scope')).toBe('P');

    http.get('/api/public/catalogs').subscribe();
    expect(backend.expectOne('/api/public/catalogs').request.headers.has('X-Scope')).toBe(false);

    http.post('/api/auth/login', {}).subscribe({ error: () => undefined });
    expect(backend.expectOne('/api/auth/login').request.headers.has('X-Scope')).toBe(false);
  });

  it('leaves requests to other origins untouched', () => {
    const { http, backend, tokens } = setup();
    tokens.set('access-1');

    http.get('https://example.org/data').subscribe();
    const request = backend.expectOne('https://example.org/data');

    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-Scope')).toBe(false);
    request.flush({});
  });

  it('refreshes once for parallel 401s and repeats each request with the new token', async () => {
    const { http, backend, tokens } = setup();
    tokens.set('expired');

    const first = firstValueFrom(http.get('/api/members'));
    const second = firstValueFrom(http.get('/api/contributions'));
    backend.expectOne('/api/members').flush({ message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/contributions').flush({ message: 'x' }, { status: 401, statusText: 'Unauthorized' });

    const refresh = backend.expectOne('/api/auth/refresh');
    expect(refresh.request.method).toBe('POST');
    expect(refresh.request.headers.get('X-Requested-With')).toBe('XMLHttpRequest');
    refresh.flush({ accessToken: 'fresh', expiresIn: 900 });

    const retryMembers = backend.expectOne('/api/members');
    const retryContributions = backend.expectOne('/api/contributions');
    expect(retryMembers.request.headers.get('Authorization')).toBe('Bearer fresh');
    expect(retryContributions.request.headers.get('Authorization')).toBe('Bearer fresh');
    retryMembers.flush(['m']);
    retryContributions.flush(['c']);

    expect(await first).toEqual(['m']);
    expect(await second).toEqual(['c']);
    expect(tokens.token).toBe('fresh');
  });

  it('ends the session when the refresh is rejected', async () => {
    const { http, backend, tokens } = setup();
    tokens.set('expired');
    let expired = 0;
    tokens.expired$.subscribe(() => expired++);

    const result = firstValueFrom(http.get('/api/members')).catch((error: unknown) => error);
    backend.expectOne('/api/members').flush({ message: 'x' }, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/auth/refresh').flush({ message: 'x' }, { status: 401, statusText: 'Unauthorized' });

    const error = await result;
    expect(error).toBeInstanceOf(DomainError);
    expect((error as DomainError).code).toBe('UNAUTHENTICATED');
    expect(expired).toBe(1);
    expect(tokens.token).toBeNull();
  });

  it('does not try to refresh when the login itself answers 401', async () => {
    const { http, backend } = setup(null);

    const result = firstValueFrom(http.post('/api/auth/login', {})).catch((error: unknown) => error);
    backend
      .expectOne('/api/auth/login')
      .flush(
        { code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' },
        { status: 401, statusText: 'Unauthorized' },
      );

    const error = (await result) as DomainError;
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.message).toBe('Correo o contraseña incorrectos.');
    backend.expectNone('/api/auth/refresh');
  });

  it('keeps the code and message of a failed download, whose JSON body arrives as a Blob', async () => {
    const { http, backend } = setup();

    const result = firstValueFrom(http.get('/api/certificates/9/pdf', { responseType: 'blob' })).catch(
      (error: unknown) => error,
    );
    backend.expectOne('/api/certificates/9/pdf').flush(
      new Blob([JSON.stringify({ code: 'NOT_FOUND', message: 'El certificado no existe.' })], {
        type: 'application/json',
      }),
      { status: 404, statusText: 'Not Found' },
    );

    const error = (await result) as DomainError;
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('NOT_FOUND');
    expect(error.message).toBe('El certificado no existe.');
    expect(error.status).toBe(404);
  });

  it('falls back to the status text when a failed download has no JSON body', async () => {
    const { http, backend } = setup();

    const result = firstValueFrom(http.get('/api/certificates/9/pdf', { responseType: 'blob' })).catch(
      (error: unknown) => error,
    );
    backend
      .expectOne('/api/certificates/9/pdf')
      .flush(new Blob(['<html>bad gateway</html>']), { status: 403, statusText: 'Forbidden' });

    const error = (await result) as DomainError;
    expect(error.code).toBe('FORBIDDEN');
    expect(error.message).toBe('No tienes permiso para realizar esta acción.');
  });

  it('does not loop when the repeated request is rejected again', async () => {
    const { http, backend, tokens } = setup();
    tokens.set('expired');

    const result = firstValueFrom(http.get('/api/members')).catch((error: unknown) => error);
    backend.expectOne('/api/members').flush({}, { status: 401, statusText: 'Unauthorized' });
    backend.expectOne('/api/auth/refresh').flush({ accessToken: 'fresh', expiresIn: 900 });
    backend.expectOne('/api/members').flush({ code: 'FORBIDDEN', message: 'Sin permiso.' }, { status: 401, statusText: 'Unauthorized' });

    expect(((await result) as DomainError).status).toBe(401);
    backend.expectNone('/api/auth/refresh');
  });
});

describe('EMAIL_NOT_VERIFIED handling', () => {
  function setupLocking() {
    const handleEmailNotVerified = vi.fn().mockResolvedValue(undefined);
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([errorInterceptor, authInterceptor, scopeInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: { activeScope: () => congregation, handleEmailNotVerified } },
      ],
    });
    return { http: TestBed.inject(HttpClient), backend: TestBed.inject(HttpTestingController), handleEmailNotVerified };
  }

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('maps the 403 to a DomainError and locks the app through the session', async () => {
    const { http, backend, handleEmailNotVerified } = setupLocking();

    const result = firstValueFrom(http.get('/api/members')).catch((error: unknown) => error);
    backend
      .expectOne('/api/members')
      .flush({ code: 'EMAIL_NOT_VERIFIED', message: 'Confirma tu correo.' }, { status: 403, statusText: 'Forbidden' });

    const error = (await result) as DomainError;
    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('EMAIL_NOT_VERIFIED');
    expect(error.status).toBe(403);
    expect(handleEmailNotVerified).toHaveBeenCalledTimes(1);
  });

  it('does not react to the same code on auth calls, so reading the session cannot loop', async () => {
    const { http, backend, handleEmailNotVerified } = setupLocking();

    const result = firstValueFrom(http.get('/api/auth/me')).catch((error: unknown) => error);
    backend.expectOne('/api/auth/me').flush({ code: 'EMAIL_NOT_VERIFIED' }, { status: 403, statusText: 'Forbidden' });

    expect(((await result) as DomainError).code).toBe('EMAIL_NOT_VERIFIED');
    expect(handleEmailNotVerified).not.toHaveBeenCalled();
  });
});
