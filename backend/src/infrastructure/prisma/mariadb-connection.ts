export interface MariaDbConnectionConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
  connectionLimit: number;
}

const DEFAULT_MARIADB_PORT = 3306;
const DEFAULT_CONNECTION_LIMIT = 10;

/** Prisma migrations read a mysql:// URL, while the driver adapter needs discrete settings. */
export function parseMariaDbUrl(databaseUrl: string): MariaDbConnectionConfig {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    // The original error repeats the whole URL, password included.
    throw new Error('DATABASE_URL is not a valid URL');
  }
  const limit = url.searchParams.get('connection_limit');

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : DEFAULT_MARIADB_PORT,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    connectionLimit: limit ? Number(limit) : DEFAULT_CONNECTION_LIMIT,
  };
}
