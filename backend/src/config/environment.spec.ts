import {
  isMailConfigured,
  isSecureDeployment,
  validateEnvironment,
} from './environment.js';

const validEnvironment = {
  DATABASE_URL: 'mysql://user:secret-value@localhost:3306/church',
  REDIS_URL: 'redis://localhost:6379',
  JWT_SECRET: 'a-test-secret-with-at-least-32-characters',
};

describe('validateEnvironment', () => {
  it('applies defaults to optional values', () => {
    const environment = validateEnvironment(validEnvironment);

    expect(environment.PORT).toBe(3000);
    expect(environment.SWAGGER_ENABLED).toBe(false);
    expect(environment.TRUST_PROXY).toBe(false);
  });

  it('does not need a dedicated key for the AI keys of the sedes, and checks it when it is set', () => {
    expect(
      validateEnvironment(validEnvironment).AI_SECRETS_KEY,
    ).toBeUndefined();
    expect(
      validateEnvironment({ ...validEnvironment, AI_SECRETS_KEY: '' })
        .AI_SECRETS_KEY,
    ).toBeUndefined();
    expect(
      validateEnvironment({
        ...validEnvironment,
        AI_SECRETS_KEY: 'a-dedicated-key-with-at-least-32-characters',
      }).AI_SECRETS_KEY,
    ).toBe('a-dedicated-key-with-at-least-32-characters');
    expect(() =>
      validateEnvironment({ ...validEnvironment, AI_SECRETS_KEY: 'corta' }),
    ).toThrow(/AI_SECRETS_KEY/);
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

  it('defaults the country of bare municipality codes and accepts another ISO code', () => {
    expect(validateEnvironment(validEnvironment).DEFAULT_COUNTRY_ISO).toBe(
      'CO',
    );
    expect(
      validateEnvironment({ ...validEnvironment, DEFAULT_COUNTRY_ISO: 'ec' })
        .DEFAULT_COUNTRY_ISO,
    ).toBe('EC');
    expect(() =>
      validateEnvironment({ ...validEnvironment, DEFAULT_COUNTRY_ISO: 'COL' }),
    ).toThrow(/DEFAULT_COUNTRY_ISO/);
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

  describe('proxy trust', () => {
    it.each([
      ['true', true],
      ['1', 1],
      ['172.18.0.0/16, 10.0.0.1', ['172.18.0.0/16', '10.0.0.1']],
    ])('accepts TRUST_PROXY=%s', (raw, expected) => {
      const environment = validateEnvironment({
        ...validEnvironment,
        TRUST_PROXY: raw,
      });

      expect(environment.TRUST_PROXY).toEqual(expected);
    });

    it.each(['yes', '10.0.0.0/40', 'banana'])(
      'rejects TRUST_PROXY=%s',
      (raw) => {
        expect(() =>
          validateEnvironment({ ...validEnvironment, TRUST_PROXY: raw }),
        ).toThrow(/TRUST_PROXY/);
      },
    );
  });

  describe('session lifetimes', () => {
    it('caps the access token at 30 minutes', () => {
      expect(
        validateEnvironment({ ...validEnvironment, JWT_EXPIRATION: '30m' })
          .JWT_EXPIRATION,
      ).toBe('30m');
      for (const value of ['31m', '1h', '1d']) {
        expect(() =>
          validateEnvironment({ ...validEnvironment, JWT_EXPIRATION: value }),
        ).toThrow(/JWT_EXPIRATION must be 30m or less/);
      }
    });

    it('defaults the absolute session lifetime to 30 days and keeps it above the refresh window', () => {
      expect(validateEnvironment(validEnvironment).REFRESH_MAX_LIFETIME).toBe(
        '30d',
      );
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          REFRESH_TTL: '10d',
          REFRESH_MAX_LIFETIME: '7d',
        }),
      ).toThrow(/REFRESH_MAX_LIFETIME/);
    });
  });

  describe('secure cookie', () => {
    it.each([
      ['production', 'http://localhost', true],
      ['test', 'https://staging.iglesia.org', true],
      ['development', 'HTTPS://staging.iglesia.org', true],
      ['development', 'http://localhost:4200', false],
    ] as const)('%s with %s -> %s', (nodeEnv, baseUrl, expected) => {
      expect(
        isSecureDeployment({ NODE_ENV: nodeEnv, APP_BASE_URL: baseUrl }),
      ).toBe(expected);
    });
  });

  describe('authentication settings', () => {
    it('applies defaults to token lifetimes and the app address', () => {
      const environment = validateEnvironment(validEnvironment);

      expect(environment.JWT_EXPIRATION).toBe('15m');
      expect(environment.REFRESH_TTL).toBe('7d');
      expect(environment.APP_BASE_URL).toBe('http://localhost:4200');
    });

    it('requires a JWT secret of at least 32 characters', () => {
      expect(() =>
        validateEnvironment({ ...validEnvironment, JWT_SECRET: undefined }),
      ).toThrow(/JWT_SECRET/);
      expect(() =>
        validateEnvironment({ ...validEnvironment, JWT_SECRET: 'CHANGE_ME' }),
      ).toThrow(/JWT_SECRET/);
      expect(() =>
        validateEnvironment({ ...validEnvironment, JWT_SECRET: 'CHANGE_ME' }),
      ).not.toThrow(/CHANGE_ME/);
    });

    it.each(['15', 'abc', '0m', '5w'])('rejects the lifetime %s', (value) => {
      expect(() =>
        validateEnvironment({ ...validEnvironment, JWT_EXPIRATION: value }),
      ).toThrow(/JWT_EXPIRATION/);
    });

    it('rejects an app address without protocol', () => {
      expect(() =>
        validateEnvironment({ ...validEnvironment, APP_BASE_URL: 'localhost' }),
      ).toThrow(/APP_BASE_URL/);
    });
  });

  describe('mail settings', () => {
    it('treats empty variables as not configured', () => {
      const environment = validateEnvironment({
        ...validEnvironment,
        SMTP_HOST: '',
        SMTP_PORT: '',
        SMTP_USER: '',
      });

      expect(environment.SMTP_HOST).toBeUndefined();
      expect(environment.SMTP_PORT).toBeUndefined();
      expect(isMailConfigured(environment)).toBe(false);
    });

    it('parses a complete SMTP configuration', () => {
      const environment = validateEnvironment({
        ...validEnvironment,
        SMTP_HOST: 'smtp.example.org',
        SMTP_PORT: '587',
        SMTP_USER: 'mailer',
        SMTP_PASSWORD: 'smtp-secret',
        SMTP_FROM: 'Iglesia <no-reply@example.org>',
      });

      expect(environment.SMTP_PORT).toBe(587);
      expect(environment.SMTP_SECURE).toBe(false);
      expect(isMailConfigured(environment)).toBe(true);
    });

    it('requires a sender when a host is set', () => {
      expect(() =>
        validateEnvironment({
          ...validEnvironment,
          SMTP_HOST: 'smtp.example.org',
        }),
      ).toThrow(/SMTP_FROM/);
    });

    it('requires user and password together without echoing them', () => {
      const invalid = { ...validEnvironment, SMTP_USER: 'mailer-user' };

      expect(() => validateEnvironment(invalid)).toThrow(/SMTP_PASSWORD/);
      expect(() => validateEnvironment(invalid)).not.toThrow(/mailer-user/);
    });
  });
});
