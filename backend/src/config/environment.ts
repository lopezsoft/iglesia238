import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';
import { DURATION_PATTERN, parseDurationSeconds } from './duration.js';
import { parseTrustProxy, type TrustProxySetting } from './trust-proxy.js';

export const NODE_ENVIRONMENTS = ['development', 'test', 'production'] as const;
export type NodeEnvironment = (typeof NODE_ENVIRONMENTS)[number];

export const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'log',
  'debug',
  'verbose',
] as const;
export type AppLogLevel = (typeof LOG_LEVELS)[number];

const toBoolean = ({ value }: { value: unknown }): unknown =>
  value === undefined ? value : value === true || value === 'true';

// An empty variable in a .env file means "not configured".
const emptyToUndefined = ({ value }: { value: unknown }): unknown =>
  value === '' ? undefined : value;

const toCountryIso = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' && value.trim() !== ''
    ? value.trim().toUpperCase()
    : value;

const toOptionalNumber = ({ value }: { value: unknown }): unknown =>
  value === undefined || value === '' ? undefined : Number(value);

export const MIN_JWT_SECRET_LENGTH = 32;
/** A stolen access token works until it expires, so its lifetime has a ceiling. */
export const MAX_ACCESS_TOKEN_SECONDS = 30 * 60;

// A value that is not a valid proxy setting is kept as typed so validation can reject it.
const toTrustProxy = ({ value }: { value: unknown }): unknown =>
  value === undefined ? value : (parseTrustProxy(value) ?? value);

export const STORAGE_DRIVERS = ['local'] as const;
export type StorageDriver = (typeof STORAGE_DRIVERS)[number];

export class Environment {
  @IsIn(NODE_ENVIRONMENTS)
  NODE_ENV: NodeEnvironment = 'development';

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @Matches(/^mysql:\/\/.+/, {
    message: 'DATABASE_URL must start with mysql://',
  })
  DATABASE_URL!: string;

  @IsString()
  @Matches(/^rediss?:\/\/.+/, {
    message: 'REDIS_URL must start with redis:// or rediss://',
  })
  REDIS_URL!: string;

  /** Comma-separated list of allowed browser origins. */
  @IsString()
  CORS_ORIGIN: string = 'http://localhost:4200';

  @IsIn(LOG_LEVELS)
  LOG_LEVEL: AppLogLevel = 'log';

  /** Swagger exposes the API map, so production must opt in explicitly. */
  @Transform(toBoolean)
  @IsBoolean()
  SWAGGER_ENABLED: boolean = false;

  /**
   * Proxies whose X-Forwarded-For is believed, to know the client IP (rate limits depend on it):
   * false (none), a number of trusted hops (1 behind a single proxy), or the proxies' addresses/CIDR
   * ranges. `true` trusts every hop and lets a client choose its own IP when the proxy appends to the
   * header: prefer a hop count or an address list.
   */
  @Transform(toTrustProxy)
  TRUST_PROXY: TrustProxySetting = false;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1024)
  BODY_LIMIT_BYTES: number = 1_048_576;

  /** Signs access tokens. Random, at least 32 characters, different in every environment. */
  @IsString()
  @MinLength(MIN_JWT_SECRET_LENGTH)
  JWT_SECRET!: string;

  /**
   * Signs the verification links (QR codes) printed on certificates. Optional: without it a key derived
   * from JWT_SECRET is used. Set it (and never change it) if JWT_SECRET is rotated, because a new key
   * invalidates every QR code already printed.
   */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  @MinLength(MIN_JWT_SECRET_LENGTH)
  CERTIFICATE_VERIFICATION_SECRET?: string;

  /** Where the uploaded files (the logo of a denomination) are kept. Only the local disk exists for now. */
  @IsIn(STORAGE_DRIVERS)
  STORAGE_DRIVER: StorageDriver = 'local';

  /**
   * Folder of the local storage. In production mount a persistent volume here: without it the files are lost
   * every time the container is redeployed. It is created if it does not exist.
   */
  @IsString()
  @MinLength(1)
  STORAGE_DIR: string = './storage';

  /** Lifetime of the access token (30s, 15m, 1h, 1d). */
  @Matches(DURATION_PATTERN, { message: 'JWT_EXPIRATION must look like 15m' })
  JWT_EXPIRATION: string = '15m';

  /** Lifetime of the refresh token and its cookie (30s, 15m, 1h, 7d). */
  @Matches(DURATION_PATTERN, { message: 'REFRESH_TTL must look like 7d' })
  REFRESH_TTL: string = '7d';

  /**
   * Absolute lifetime of a session, however often its refresh token is rotated: after it the person
   * signs in again. Must not be shorter than REFRESH_TTL.
   */
  @Matches(DURATION_PATTERN, {
    message: 'REFRESH_MAX_LIFETIME must look like 30d',
  })
  REFRESH_MAX_LIFETIME: string = '30d';

  /** Public address of the web app: invitation and recovery links are built from it. */
  @Matches(/^https?:\/\/[^\s/]+/, {
    message: 'APP_BASE_URL must start with http:// or https://',
  })
  APP_BASE_URL: string = 'http://localhost:4200';

  /**
   * ISO 3166-1 alpha-2 country assumed only where a request carries a municipality code without its
   * country (person addresses, the public application form, GET /geo/municipalities/:code without
   * countryId). Legal entities and congregations always resolve municipalities with their own country.
   */
  @Transform(toCountryIso)
  @Matches(/^[A-Z]{2}$/, {
    message: 'DEFAULT_COUNTRY_ISO must be an ISO 3166-1 alpha-2 code',
  })
  DEFAULT_COUNTRY_ISO: string = 'CO';

  // Mail is optional: without SMTP_HOST the API logs that a message was not sent and the inviter
  // receives the one-time link in the response.
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @Transform(toOptionalNumber)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  SMTP_PORT?: number;

  /** true for implicit TLS (port 465); false negotiates STARTTLS when the server offers it. */
  @Transform(toBoolean)
  @IsBoolean()
  SMTP_SECURE: boolean = false;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  /** Sender shown to the recipient, for example "Iglesia 238 <no-reply@example.org>". */
  @Transform(emptyToUndefined)
  @IsOptional()
  @IsString()
  SMTP_FROM?: string;
}

/**
 * The refresh cookie must travel only over HTTPS: always in production, and in any other environment
 * whose public address is https (a staging server behind TLS).
 */
export function isSecureDeployment(
  environment: Pick<Environment, 'NODE_ENV' | 'APP_BASE_URL'>,
): boolean {
  return (
    environment.NODE_ENV === 'production' ||
    environment.APP_BASE_URL.toLowerCase().startsWith('https://')
  );
}

/** True when the environment has everything the SMTP adapter needs. */
export function isMailConfigured(
  environment: Pick<Environment, 'SMTP_HOST' | 'SMTP_FROM'>,
): boolean {
  return Boolean(environment.SMTP_HOST && environment.SMTP_FROM);
}

export function validateEnvironment(raw: Record<string, unknown>): Environment {
  const environment = plainToInstance(Environment, raw, {
    exposeDefaultValues: true,
  });
  const errors = validateSync(environment, { skipMissingProperties: false });

  if (errors.length > 0) {
    // Only property names and rules are reported: values may contain secrets.
    const details = errors
      .map((error) =>
        Object.values(error.constraints ?? {})
          .map((rule) => rule.replace(/ but actual is .*/, ''))
          .join(', '),
      )
      .join('; ');
    throw new Error(`Invalid environment configuration: ${details}`);
  }

  const problem =
    findMailProblem(environment) ??
    findTrustProxyProblem(environment) ??
    findLifetimeProblem(environment);
  if (problem) {
    throw new Error(`Invalid environment configuration: ${problem}`);
  }

  // A malformed URL would otherwise surface later in an error that repeats it, password included.
  for (const key of ['DATABASE_URL', 'REDIS_URL'] as const) {
    if (!URL.canParse(environment[key])) {
      throw new Error(
        `Invalid environment configuration: ${key} is not a valid URL`,
      );
    }
  }

  return environment;
}

function findTrustProxyProblem(environment: Environment): string | null {
  return typeof environment.TRUST_PROXY === 'string'
    ? 'TRUST_PROXY must be false, true, a hop count or a list of proxy addresses'
    : null;
}

function findLifetimeProblem(environment: Environment): string | null {
  if (
    parseDurationSeconds(environment.JWT_EXPIRATION) > MAX_ACCESS_TOKEN_SECONDS
  ) {
    return 'JWT_EXPIRATION must be 30m or less';
  }
  if (
    parseDurationSeconds(environment.REFRESH_MAX_LIFETIME) <
    parseDurationSeconds(environment.REFRESH_TTL)
  ) {
    return 'REFRESH_MAX_LIFETIME must not be shorter than REFRESH_TTL';
  }
  return null;
}

function findMailProblem(environment: Environment): string | null {
  if (environment.SMTP_HOST && !environment.SMTP_FROM) {
    return 'SMTP_FROM is required when SMTP_HOST is set';
  }
  if (Boolean(environment.SMTP_USER) !== Boolean(environment.SMTP_PASSWORD)) {
    return 'SMTP_USER and SMTP_PASSWORD must be set together';
  }
  return null;
}
