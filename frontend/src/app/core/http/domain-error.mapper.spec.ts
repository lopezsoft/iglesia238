import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { DomainError, userMessage } from '../errors/domain-error';
import { toDomainError } from './domain-error.mapper';

function failure(status: number, body: unknown = null, headers?: HttpHeaders): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, headers, url: '/api/x' });
}

describe('toDomainError', () => {
  it('keeps the code and the Spanish message of the API body', () => {
    const error = toDomainError(
      failure(401, { statusCode: 401, error: 'Unauthorized', code: 'INVALID_CREDENTIALS', message: 'Correo o contraseña incorrectos.' }),
    );

    expect(error).toBeInstanceOf(DomainError);
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.message).toBe('Correo o contraseña incorrectos.');
    expect(error.status).toBe(401);
    expect(userMessage(error)).toBe('Correo o contraseña incorrectos.');
  });

  it('joins the validation messages of a 400', () => {
    const error = toDomainError(
      failure(400, { statusCode: 400, message: ['El correo no es válido.', 'La contraseña es muy corta.'] }),
    );

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.message).toBe('El correo no es válido. La contraseña es muy corta.');
  });

  it('falls back to a Spanish message by status when the body has none', () => {
    expect(toDomainError(failure(403)).code).toBe('FORBIDDEN');
    expect(toDomainError(failure(404)).message).toBe('No encontramos lo que buscas.');
    expect(toDomainError(failure(409)).code).toBe('CONFLICT');
  });

  it('never shows the message of a server fault', () => {
    const error = toDomainError(failure(500, { code: 'DB_DOWN', message: 'connect ECONNREFUSED 10.0.0.5:3306' }));

    expect(error.code).toBe('DB_DOWN');
    expect(error.message).not.toContain('ECONNREFUSED');
  });

  it('reports a network failure when there is no response', () => {
    const error = toDomainError(failure(0));

    expect(error.code).toBe('NETWORK_ERROR');
    expect(error.message).toContain('No hay conexión');
  });

  it('reads Retry-After on a rate limit', () => {
    const error = toDomainError(failure(429, null, new HttpHeaders({ 'Retry-After': '120' })));

    expect(error.code).toBe('RATE_LIMITED');
    expect(error.retryAfterSeconds).toBe(120);
  });
});
