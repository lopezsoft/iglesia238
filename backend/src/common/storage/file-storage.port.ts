export const FILE_STORAGE = Symbol('FILE_STORAGE');

/**
 * A storage key is a relative path in lowercase: `branding/12/logo-3f9a1c0b5d7e2a46.png`. Segments start with a
 * letter or a digit, so a key can never be `..`, hidden, or absolute. The database and the snapshots keep keys,
 * never absolute paths, so moving the files to another storage does not touch a single record.
 */
export const STORAGE_KEY_PATTERN =
  /^[a-z0-9][a-z0-9_-]*(?:\/[a-z0-9][a-z0-9_.-]*)+$/;
export const STORAGE_KEY_MAX_LENGTH = 255;

export function isStorageKey(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length <= STORAGE_KEY_MAX_LENGTH &&
    STORAGE_KEY_PATTERN.test(value)
  );
}

/** The storage could not be read or written (full disk, read-only volume, missing permission). */
export class StorageUnavailableError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'StorageUnavailableError';
  }
}

/** A key that does not look like a storage key: a programming error, never user input. */
export class InvalidStorageKeyError extends Error {
  constructor(key: string) {
    super(`Invalid storage key: ${key.slice(0, 80)}`);
    this.name = 'InvalidStorageKeyError';
  }
}

/** Where uploaded files live. The adapter decides the medium (local disk today, an object store later). */
export interface FileStorage {
  /** Stores the content under the key, replacing what was there. Throws StorageUnavailableError on failure. */
  write(key: string, content: Buffer): Promise<void>;
  /** The content under the key, or null when there is none. Throws StorageUnavailableError on failure. */
  read(key: string): Promise<Buffer | null>;
}
