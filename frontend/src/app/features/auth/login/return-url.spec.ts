import { DEFAULT_AFTER_LOGIN_URL, safeReturnUrl } from './return-url';

describe('safeReturnUrl', () => {
  it('keeps internal paths with query strings', () => {
    expect(safeReturnUrl('/members')).toBe('/members');
    expect(safeReturnUrl('/accounting/cash-book?month=2026-10')).toBe(
      '/accounting/cash-book?month=2026-10',
    );
  });

  it('falls back to the dashboard without a return URL', () => {
    expect(safeReturnUrl(undefined)).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl(null)).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl('')).toBe(DEFAULT_AFTER_LOGIN_URL);
  });

  it('rejects absolute and protocol-relative URLs', () => {
    expect(safeReturnUrl('https://evil.example/login')).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl('javascript:alert(1)')).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl('//evil.example')).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl('/\\evil.example')).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl('members')).toBe(DEFAULT_AFTER_LOGIN_URL);
  });

  it('rejects paths hiding control characters', () => {
    expect(safeReturnUrl('/\t/evil.example')).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl('/\n/evil.example')).toBe(DEFAULT_AFTER_LOGIN_URL);
  });

  it('does not send the user back to the login screen', () => {
    expect(safeReturnUrl('/login')).toBe(DEFAULT_AFTER_LOGIN_URL);
    expect(safeReturnUrl('/login/recover-password')).toBe(DEFAULT_AFTER_LOGIN_URL);
  });
});
