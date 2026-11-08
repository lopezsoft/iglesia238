import { createHmac, timingSafeEqual } from 'node:crypto';
import type { CertificateVerificationLinks } from '../application/ports/certificate-verification.js';

const SIGNATURE_BYTES = 16;
const TOKEN_PATTERN = /^(\d{1,10})\.([A-Za-z0-9_-]{22})$/;
const VERIFY_PATH = '/verify-certificate';

export interface HmacVerificationConfig {
  /** Key material: CERTIFICATE_VERIFICATION_SECRET, or JWT_SECRET when the former is not set. */
  readonly secret: string;
  /** Public address of the web app (APP_BASE_URL). */
  readonly appBaseUrl: string;
  /** True when `secret` is the JWT secret: the signing key is then derived, never used as is. */
  readonly derived: boolean;
}

/**
 * Signs `<certificateId>.<signature>` with HMAC-SHA256 (truncated to 128 bits). The token proves the link was
 * printed by this system; it carries no personal data and cannot be forged or guessed from the numbering.
 */
export class HmacCertificateVerificationLinks implements CertificateVerificationLinks {
  private readonly key: Buffer;
  private readonly baseUrl: string;

  constructor(config: HmacVerificationConfig) {
    this.key = config.derived
      ? createHmac('sha256', config.secret)
          .update('iglesia238/certificate-verification/v1')
          .digest()
      : Buffer.from(config.secret, 'utf8');
    this.baseUrl = config.appBaseUrl.replace(/\/+$/, '');
  }

  linkFor(certificateId: number): string {
    return `${this.baseUrl}${VERIFY_PATH}?t=${encodeURIComponent(this.tokenFor(certificateId))}`;
  }

  certificateIdOf(token: string): number | null {
    const match = TOKEN_PATTERN.exec(token);
    if (!match) {
      return null;
    }
    const id = Number(match[1]);
    if (!Number.isSafeInteger(id) || id < 1) {
      return null;
    }
    const expected = Buffer.from(this.signatureOf(id), 'utf8');
    const received = Buffer.from(match[2], 'utf8');
    return expected.length === received.length &&
      timingSafeEqual(expected, received)
      ? id
      : null;
  }

  private tokenFor(certificateId: number): string {
    return `${certificateId}.${this.signatureOf(certificateId)}`;
  }

  private signatureOf(certificateId: number): string {
    return createHmac('sha256', this.key)
      .update(`certificate:${certificateId}`)
      .digest()
      .subarray(0, SIGNATURE_BYTES)
      .toString('base64url');
  }
}
