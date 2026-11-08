import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  InvalidStorageKeyError,
  StorageUnavailableError,
} from '../../common/storage/file-storage.port.js';
import { LocalFileStorage } from './local-file-storage.js';

describe('LocalFileStorage', () => {
  let directory: string;
  let storage: LocalFileStorage;

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'iglesia238-storage-'));
    storage = new LocalFileStorage(directory);
  });
  afterEach(() => rmSync(directory, { recursive: true, force: true }));

  it('writes a file, creating the folders of its key, and reads it back', async () => {
    await storage.write(
      'branding/7/logo-aaaaaaaaaaaaaaaa.png',
      Buffer.from('hello'),
    );

    expect(
      existsSync(join(directory, 'branding', '7', 'logo-aaaaaaaaaaaaaaaa.png')),
    ).toBe(true);
    await expect(
      storage.read('branding/7/logo-aaaaaaaaaaaaaaaa.png'),
    ).resolves.toEqual(Buffer.from('hello'));
  });

  it('replaces what was under the key and leaves no temporary file behind', async () => {
    await storage.write(
      'branding/7/logo-bbbbbbbbbbbbbbbb.png',
      Buffer.from('one'),
    );
    await storage.write(
      'branding/7/logo-bbbbbbbbbbbbbbbb.png',
      Buffer.from('two'),
    );

    await expect(
      storage.read('branding/7/logo-bbbbbbbbbbbbbbbb.png'),
    ).resolves.toEqual(Buffer.from('two'));
    expect(readdirSync(join(directory, 'branding', '7'))).toEqual([
      'logo-bbbbbbbbbbbbbbbb.png',
    ]);
  });

  it('answers null for a file that does not exist', async () => {
    await expect(
      storage.read('branding/7/logo-cccccccccccccccc.png'),
    ).resolves.toBeNull();
  });

  it.each([
    '../secret.txt',
    'branding/../../secret.txt',
    '/etc/passwd',
    'C:/Windows/win.ini',
    'branding\\7\\logo.png',
    'branding//logo.png',
    'branding/7/.hidden',
    'branding/7/Logo.PNG',
    'branding',
    '',
    'branding/7/logo.png\0',
  ])('refuses the key %j before touching the disk', async (key) => {
    await expect(storage.write(key, Buffer.from('x'))).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    await expect(storage.read(key)).rejects.toBeInstanceOf(
      InvalidStorageKeyError,
    );
    expect(readdirSync(directory)).toEqual([]);
  });

  it('reports a storage that cannot be written as unavailable, not as a bug', async () => {
    // A file where the folder of the key should be.
    writeFileSync(join(directory, 'branding'), 'in the way');

    await expect(
      storage.write('branding/7/logo-dddddddddddddddd.png', Buffer.from('x')),
    ).rejects.toBeInstanceOf(StorageUnavailableError);
  });

  describe('check', () => {
    it('is fine for a folder that can be written, creating it if needed', async () => {
      const nested = new LocalFileStorage(
        join(directory, 'does', 'not', 'exist'),
      );

      await expect(nested.check()).resolves.toBeNull();
      expect(readdirSync(join(directory, 'does', 'not', 'exist'))).toEqual([]);
    });

    it('describes the problem when the folder cannot be written', async () => {
      writeFileSync(join(directory, 'blocked'), 'a file, not a folder');
      const blocked = new LocalFileStorage(join(directory, 'blocked'));

      const problem = await blocked.check();

      expect(problem).toContain('not writable');
      expect(problem).toContain('blocked');
    });
  });
});
