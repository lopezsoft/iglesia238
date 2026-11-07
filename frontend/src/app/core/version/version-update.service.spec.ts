import { ErrorHandler } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GlobalErrorHandler } from '../errors/global-error-handler';
import {
  CURRENT_APP_VERSION,
  PAGE_RELOADER,
  RELOADED_VERSION_STORAGE_KEY,
  VERSION_FETCHER,
  VersionUpdateService,
  isChunkLoadError,
} from './version-update.service';

describe('VersionUpdateService', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  function setup(options: { currentVersion?: string; remoteVersion?: string | null }) {
    const reloads: string[] = [];
    let remote = options.remoteVersion === undefined ? '0.15.0' : options.remoteVersion;

    TestBed.configureTestingModule({
      providers: [
        { provide: CURRENT_APP_VERSION, useValue: options.currentVersion ?? '0.15.0' },
        {
          provide: VERSION_FETCHER,
          useValue: async () => (remote ? { version: remote } : null),
        },
        {
          provide: PAGE_RELOADER,
          useValue: (reason: string) => {
            reloads.push(reason);
          },
        },
        { provide: ErrorHandler, useClass: GlobalErrorHandler },
      ],
    });

    return {
      service: TestBed.inject(VersionUpdateService),
      errorHandler: TestBed.inject(ErrorHandler),
      reloads,
      setRemoteVersion: (next: string | null) => {
        remote = next;
      },
    };
  }

  it('does not reload when the remote version matches the running version', async () => {
    const { service, reloads } = setup({
      currentVersion: '0.15.0',
      remoteVersion: '0.15.0',
    });

    const updated = await service.checkForUpdate(true);

    expect(updated).toBe(false);
    expect(reloads).toEqual([]);
  });

  it('reloads automatically when a newer version is detected and prevents reload loops', async () => {
    const { service, reloads } = setup({
      currentVersion: '0.14.0',
      remoteVersion: '0.15.0',
    });

    const first = await service.checkForUpdate(true);
    const second = await service.checkForUpdate(true);

    expect(first).toBe(true);
    expect(second).toBe(false);
    expect(reloads).toEqual(['version:0.15.0']);
    expect(sessionStorage.getItem(RELOADED_VERSION_STORAGE_KEY)).toBe('0.15.0');
  });

  it('identifies lazy chunk load errors across browsers and reloads once within cooldown', () => {
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: /chunk-ABC.js')),
    ).toBe(true);
    expect(isChunkLoadError(new Error('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new Error('Normal business validation error'))).toBe(false);

    const { errorHandler, reloads } = setup({
      currentVersion: '0.15.0',
      remoteVersion: '0.15.0',
    });

    errorHandler.handleError(
      new TypeError('Failed to fetch dynamically imported module: https://app.iglesia238.com/chunk-123.js'),
    );
    errorHandler.handleError(
      new TypeError('Failed to fetch dynamically imported module: https://app.iglesia238.com/chunk-123.js'),
    );

    expect(reloads).toEqual(['chunk-error']);
  });
});
