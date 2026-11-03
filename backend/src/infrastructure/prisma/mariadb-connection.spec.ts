import { parseMariaDbUrl } from './mariadb-connection.js';

describe('parseMariaDbUrl', () => {
  it('reads every part of the URL', () => {
    expect(
      parseMariaDbUrl('mysql://app:pass@db:3307/church?connection_limit=5'),
    ).toEqual({
      host: 'db',
      port: 3307,
      user: 'app',
      password: 'pass',
      database: 'church',
      connectionLimit: 5,
    });
  });

  it('decodes special characters in credentials', () => {
    const config = parseMariaDbUrl('mysql://app:p%40ss%2Fword@db/church');

    expect(config.password).toBe('p@ss/word');
  });

  it('rejects an invalid URL without revealing it', () => {
    expect(() => parseMariaDbUrl('mysql://app:p#ss@db:x/church')).toThrow(
      'DATABASE_URL is not a valid URL',
    );
  });

  it('uses defaults for port and connection limit', () => {
    const config = parseMariaDbUrl('mysql://app:pass@db/church');

    expect(config.port).toBe(3306);
    expect(config.connectionLimit).toBe(10);
  });
});
