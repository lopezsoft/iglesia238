import { plainToInstance, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

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

  /** Enable only behind a reverse proxy, so client IPs cannot be spoofed. */
  @Transform(toBoolean)
  @IsBoolean()
  TRUST_PROXY: boolean = false;

  @Transform(({ value }) => Number(value))
  @IsInt()
  @Min(1024)
  BODY_LIMIT_BYTES: number = 1_048_576;
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
