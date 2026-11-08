import { HmacCertificateVerificationLinks } from './hmac-certificate-verification-links.js';

const SECRET = 'x'.repeat(40);
const config = {
  secret: SECRET,
  appBaseUrl: 'https://app.iglesia238.com/',
  derived: false,
};

function tokenOf(link: string): string {
  return new URL(link).searchParams.get('t') ?? '';
}

describe('HmacCertificateVerificationLinks', () => {
  const links = new HmacCertificateVerificationLinks(config);

  it('builds an absolute link on the public address of the app', () => {
    const link = links.linkFor(42);

    expect(
      link.startsWith('https://app.iglesia238.com/verify-certificate?t=42.'),
    ).toBe(true);
  });

  it('recovers the certificate id from its own token', () => {
    expect(links.certificateIdOf(tokenOf(links.linkFor(42)))).toBe(42);
    expect(links.certificateIdOf(tokenOf(links.linkFor(2_000_000_000)))).toBe(
      2_000_000_000,
    );
  });

  it('rejects a token whose id was changed (the signature no longer matches)', () => {
    const [, signature] = tokenOf(links.linkFor(42)).split('.');

    expect(links.certificateIdOf(`43.${signature}`)).toBeNull();
  });

  it('rejects malformed tokens without throwing', () => {
    for (const token of [
      '',
      'abc',
      '42',
      '42.',
      '.abc',
      '0.AAAAAAAAAAAAAAAAAAAAAA',
      '42.short',
      `42.${'A'.repeat(23)}`,
      '99999999999.AAAAAAAAAAAAAAAAAAAAAA',
    ]) {
      expect(links.certificateIdOf(token)).toBeNull();
    }
  });

  it('does not accept tokens signed with another key', () => {
    const other = new HmacCertificateVerificationLinks({
      ...config,
      secret: 'y'.repeat(40),
    });

    expect(links.certificateIdOf(tokenOf(other.linkFor(42)))).toBeNull();
  });

  it('derives its key when it falls back on the JWT secret, so that secret is never used as is', () => {
    const asJwt = new HmacCertificateVerificationLinks({
      ...config,
      derived: true,
    });

    expect(asJwt.certificateIdOf(tokenOf(links.linkFor(42)))).toBeNull();
    expect(asJwt.certificateIdOf(tokenOf(asJwt.linkFor(42)))).toBe(42);
  });
});
