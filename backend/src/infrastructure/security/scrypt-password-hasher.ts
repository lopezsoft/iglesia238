import { Injectable } from '@nestjs/common';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { PasswordHasher } from '../../common/security/password-hasher.port.js';

export interface ScryptParameters {
  /** log2 of the CPU/memory cost N. */
  logN: number;
  blockSize: number;
  parallelization: number;
}

/** OWASP-listed scrypt setting equivalent to N=2^17,r=8,p=1: 64 MiB per hash. */
export const DEFAULT_SCRYPT_PARAMETERS: ScryptParameters = {
  logN: 16,
  blockSize: 8,
  parallelization: 2,
};

const SALT_BYTES = 16;
const KEY_BYTES = 64;
const ALGORITHM = 'scrypt';
const MEMORY_HEADROOM = 2;
// A stored hash must never ask for more memory than the stronger parameters we would produce.
const MAX_ACCEPTED_LOG_N = 20;

interface ParsedHash {
  parameters: ScryptParameters;
  salt: Buffer;
  key: Buffer;
}

function deriveKey(
  plain: string,
  salt: Buffer,
  parameters: ScryptParameters,
  keyLength: number,
): Promise<Buffer> {
  const cost = 2 ** parameters.logN;
  return new Promise((resolve, reject) => {
    scrypt(
      plain.normalize('NFKC'),
      salt,
      keyLength,
      {
        N: cost,
        r: parameters.blockSize,
        p: parameters.parallelization,
        maxmem: 128 * cost * parameters.blockSize * MEMORY_HEADROOM,
      },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

function parseHash(stored: string): ParsedHash | null {
  const [algorithm, logN, blockSize, parallelization, salt, key, ...rest] =
    stored.split('$');
  if (algorithm !== ALGORITHM || rest.length > 0 || !key) {
    return null;
  }

  const parameters = {
    logN: Number(logN),
    blockSize: Number(blockSize),
    parallelization: Number(parallelization),
  };
  const isValid =
    Number.isInteger(parameters.logN) &&
    parameters.logN >= 1 &&
    parameters.logN <= MAX_ACCEPTED_LOG_N &&
    Number.isInteger(parameters.blockSize) &&
    parameters.blockSize >= 1 &&
    parameters.blockSize <= 32 &&
    Number.isInteger(parameters.parallelization) &&
    parameters.parallelization >= 1 &&
    parameters.parallelization <= 16;
  if (!isValid) {
    return null;
  }

  const saltBytes = Buffer.from(salt, 'base64');
  const keyBytes = Buffer.from(key, 'base64');
  return saltBytes.length > 0 && keyBytes.length > 0
    ? { parameters, salt: saltBytes, key: keyBytes }
    : null;
}

/**
 * Password hashing with scrypt from node:crypto. The hash is self-describing
 * (scrypt$logN$r$p$salt$key), so the cost can grow and old hashes are upgraded when the user signs in.
 */
@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly parameters: ScryptParameters = DEFAULT_SCRYPT_PARAMETERS,
  ) {}

  async hash(plain: string): Promise<string> {
    const salt = randomBytes(SALT_BYTES);
    const key = await deriveKey(plain, salt, this.parameters, KEY_BYTES);
    const { logN, blockSize, parallelization } = this.parameters;
    return [
      ALGORITHM,
      logN,
      blockSize,
      parallelization,
      salt.toString('base64'),
      key.toString('base64'),
    ].join('$');
  }

  async verify(plain: string, storedHash: string | null): Promise<boolean> {
    const parsed = storedHash === null ? null : parseHash(storedHash);
    if (!parsed) {
      // Same cost as a real check, so unknown users and unusable hashes are not distinguishable.
      await this.verifyAgainstDummy(plain);
      return false;
    }

    const key = await deriveKey(
      plain,
      parsed.salt,
      parsed.parameters,
      parsed.key.length,
    );
    return timingSafeEqual(key, parsed.key);
  }

  needsRehash(storedHash: string): boolean {
    const parsed = parseHash(storedHash);
    return (
      !parsed ||
      parsed.parameters.logN < this.parameters.logN ||
      parsed.parameters.blockSize < this.parameters.blockSize ||
      parsed.parameters.parallelization < this.parameters.parallelization
    );
  }

  private async verifyAgainstDummy(plain: string): Promise<void> {
    this.dummyHash ??= this.hash(randomBytes(SALT_BYTES).toString('hex'));
    const parsed = parseHash(await this.dummyHash);
    if (parsed) {
      await deriveKey(plain, parsed.salt, parsed.parameters, parsed.key.length);
    }
  }
}
