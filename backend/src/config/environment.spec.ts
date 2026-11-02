import { validateEnvironment } from './environment.js';

const validEnvironment = {
  DATABASE_URL: 'mysql://user:secret-value@localhost:3306/church',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnvironment', () => {
  it('applies defaults to optional values', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.PORT).toBe(3000);
    expect(environment.SWAGGER_ENABLED).toBe(false);
    expect(environment.TRUST_PROXY).toBe(false);
  });

  it('parses numbers and booleans sent as strings', () => {
    const environment = validateEnvironment({
      ...validEnvironment,
      PORT: '4000',
      SWAGGER_ENABLED: 'true',
      TRUST_PROXY: 'false',
    });

    expect(environment.PORT).toBe(4000);
    expect(environment.SWAGGER_ENABLED).toBe(true);
    expect(environment.TRUST_PROXY).toBe(false);
  });

  it('rejects a missing database URL', () => {
    expect(() =>
      validateEnvironment({ REDIS_URL: validEnvironment.REDIS_URL }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects a malformed URL without repeating it', () => {
    const invalid = {
      ...validEnvironment,
      DATABASE_URL: 'mysql://app:secret#value@db:x/church',
    };

    expect(() => validateEnvironment(invalid)).toThrow(
      'DATABASE_URL is not a valid URL',
    );
    expect(() => validateEnvironment(invalid)).not.toThrow(/secret/);
  });

  it('never includes values in the error message', () => {
    const invalid = { ...validEnvironment, REDIS_URL: 'http://secret-value' };

    expect(() => validateEnvironment(invalid)).toThrow(/REDIS_URL/);
    expect(() => validateEnvironment(invalid)).not.toThrow(/secret-value/);
  });
});
