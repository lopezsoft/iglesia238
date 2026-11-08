import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from 'node:crypto';
import type { AiSecretCipher } from '../application/ports/ai-assistant.ports.js';

const VERSION = 'v1';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;

export interface AesCipherConfig {
  /**
   * AI_SECRETS_KEY, or JWT_SECRET when the former is not set. The encryption key is always derived from it, never used
   * as is. Rotating the secret makes the saved keys unreadable: the sedes would have to paste them again.
   */
  readonly secret: string;
}

/**
 * AES-256-GCM: the text is hidden and any change to it is detected. The format is `v1.<iv>.<tag>.<text>`, each part in
 * base64url, so a later key or algorithm can be told apart.
 */
export class AesSecretCipher implements AiSecretCipher {
  private readonly key: Buffer;

  constructor(config: AesCipherConfig) {
    this.key = createHmac('sha256', config.secret)
      .update('iglesia238/ai-secrets/v1')
      .digest();
    if (this.key.length !== KEY_BYTES) {
      throw new Error('The encryption key must be 32 bytes');
    }
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const text = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    return [
      VERSION,
      iv.toString('base64url'),
      cipher.getAuthTag().toString('base64url'),
      text.toString('base64url'),
    ].join('.');
  }

  decrypt(encrypted: string): string {
    const [version, iv, tag, text, ...rest] = encrypted.split('.');
    if (version !== VERSION || !iv || !tag || !text || rest.length > 0) {
      throw new Error('Unrecognised encrypted value');
    }
    const ivBytes = Buffer.from(iv, 'base64url');
    const tagBytes = Buffer.from(tag, 'base64url');
    if (ivBytes.length !== IV_BYTES || tagBytes.length !== TAG_BYTES) {
      throw new Error('Unrecognised encrypted value');
    }
    const decipher = createDecipheriv('aes-256-gcm', this.key, ivBytes);
    decipher.setAuthTag(tagBytes);
    return Buffer.concat([
      decipher.update(Buffer.from(text, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  }
}
