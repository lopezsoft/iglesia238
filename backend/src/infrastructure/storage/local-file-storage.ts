import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import {
  InvalidStorageKeyError,
  StorageUnavailableError,
  isStorageKey,
  type FileStorage,
} from '../../common/storage/file-storage.port.js';

/** Keeps the files in a folder of the local disk (a persistent volume in production). */
export class LocalFileStorage implements FileStorage {
  private readonly root: string;

  constructor(directory: string) {
    this.root = resolve(directory);
  }

  async write(key: string, content: Buffer): Promise<void> {
    const target = this.pathOf(key);
    // Written next to its destination and renamed: a reader never sees half a file.
    const temporary = `${target}.${randomUUID()}.tmp`;
    try {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(temporary, content, { flag: 'wx', mode: 0o640 });
      await rename(temporary, target);
    } catch (error) {
      await rm(temporary, { force: true }).catch(() => undefined);
      throw new StorageUnavailableError('The file could not be stored', {
        cause: error,
      });
    }
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      return await readFile(this.pathOf(key));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null;
      }
      if (error instanceof InvalidStorageKeyError) {
        throw error;
      }
      throw new StorageUnavailableError('The file could not be read', {
        cause: error,
      });
    }
  }

  /**
   * Checks at startup that the folder can be written, so a missing volume shows up in the logs and not on the
   * first upload. Returns what is wrong, or null.
   */
  async check(): Promise<string | null> {
    const probe = resolve(this.root, `.write-test-${randomUUID()}`);
    try {
      await mkdir(this.root, { recursive: true });
      await writeFile(probe, 'ok', { flag: 'wx' });
      await rm(probe, { force: true });
      return null;
    } catch (error) {
      await rm(probe, { force: true }).catch(() => undefined);
      return `The storage folder ${this.root} is not writable (${(error as NodeJS.ErrnoException).code ?? 'unknown error'})`;
    }
  }

  /** The absolute path of a key, always inside the root folder. */
  private pathOf(key: string): string {
    if (!isStorageKey(key)) {
      throw new InvalidStorageKeyError(key);
    }
    const path = resolve(this.root, ...key.split('/'));
    const fromRoot = relative(this.root, path);
    if (fromRoot === '' || fromRoot.startsWith('..') || isAbsolute(fromRoot)) {
      throw new InvalidStorageKeyError(key);
    }
    return path;
  }
}
