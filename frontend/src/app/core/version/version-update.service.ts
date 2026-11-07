import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, InjectionToken, inject } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { Subscription, filter } from 'rxjs';
import { environment } from '../../../environments/environment';
import { DebugService } from '../debug/debug.service';

export interface VersionManifest {
  readonly version: string;
}

export type VersionFetcher = () => Promise<VersionManifest | null>;
export type PageReloader = (reason: string) => void;

export const CURRENT_APP_VERSION = new InjectionToken<string>('CURRENT_APP_VERSION', {
  providedIn: 'root',
  factory: () => environment.appVersion,
});

export const VERSION_FETCHER = new InjectionToken<VersionFetcher>('VERSION_FETCHER', {
  providedIn: 'root',
  factory: () => defaultVersionFetcher,
});

export const PAGE_RELOADER = new InjectionToken<PageReloader>('PAGE_RELOADER', {
  providedIn: 'root',
  factory: () => defaultPageReloader,
});

export const VERSION_POLL_INTERVAL_MS = 60_000;
export const NAVIGATION_CHECK_COOLDOWN_MS = 30_000;
export const CHUNK_RELOAD_COOLDOWN_MS = 15_000;

export const RELOADED_VERSION_STORAGE_KEY = 'iglesia238.reloaded_version';
export const CHUNK_RELOAD_STORAGE_KEY = 'iglesia238.chunk_reload_at';

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Unable to preload CSS/i,
];

async function defaultVersionFetcher(): Promise<VersionManifest | null> {
  if (typeof fetch !== 'function') {
    return null;
  }
  const response = await fetch(`/version.json?_t=${Date.now()}`, {
    method: 'GET',
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
    },
  });
  if (!response.ok) {
    return null;
  }
  const payload: unknown = await response.json();
  if (
    payload !== null &&
    typeof payload === 'object' &&
    'version' in payload &&
    typeof (payload as { version: unknown }).version === 'string'
  ) {
    return { version: (payload as { version: string }).version.trim() };
  }
  return null;
}

function defaultPageReloader(): void {
  if (typeof window === 'undefined') {
    return;
  }
  if ('caches' in window && window.caches) {
    void window.caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => window.caches.delete(key))))
      .finally(() => {
        window.location.reload();
      });
    return;
  }
  window.location.reload();
}

/**
 * Monitors `/version.json` and lazy-loaded chunk errors to automatically reload the SPA
 * whenever a newer release is deployed in production.
 */
@Injectable({ providedIn: 'root' })
export class VersionUpdateService {
  private readonly document = inject(DOCUMENT);
  private readonly router = inject(Router, { optional: true });
  private readonly destroyRef = inject(DestroyRef);
  private readonly debug = inject(DebugService);
  private readonly currentVersion = inject(CURRENT_APP_VERSION);
  private readonly fetchVersion = inject(VERSION_FETCHER);
  private readonly reloadPage = inject(PAGE_RELOADER);

  private monitoring = false;
  private checkInFlight = false;
  private lastCheckTimestamp = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private routerSub: Subscription | null = null;

  private readonly onVisibilityChange = (): void => {
    if (this.document.visibilityState === 'visible') {
      void this.checkForUpdate(true);
    }
  };

  private readonly onWindowFocus = (): void => {
    void this.checkForUpdate(true);
  };

  startMonitoring(): void {
    if (this.monitoring) {
      return;
    }
    this.monitoring = true;

    const win = this.document.defaultView;
    this.document.addEventListener('visibilitychange', this.onVisibilityChange);
    win?.addEventListener('focus', this.onWindowFocus);

    this.intervalId = setInterval(() => {
      if (this.document.visibilityState !== 'hidden') {
        void this.checkForUpdate(true);
      }
    }, VERSION_POLL_INTERVAL_MS);

    if (this.router) {
      this.routerSub = this.router.events
        .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
        .subscribe(() => {
          void this.checkForUpdate(false);
        });
    }

    this.destroyRef.onDestroy(() => {
      this.stopMonitoring();
    });

    void this.checkForUpdate(true);
  }

  stopMonitoring(): void {
    if (!this.monitoring) {
      return;
    }
    this.monitoring = false;
    const win = this.document.defaultView;
    this.document.removeEventListener('visibilitychange', this.onVisibilityChange);
    win?.removeEventListener('focus', this.onWindowFocus);
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.routerSub?.unsubscribe();
    this.routerSub = null;
  }

  async checkForUpdate(force = false): Promise<boolean> {
    if (this.checkInFlight) {
      return false;
    }
    const now = Date.now();
    if (!force && now - this.lastCheckTimestamp < NAVIGATION_CHECK_COOLDOWN_MS) {
      return false;
    }

    this.checkInFlight = true;
    this.lastCheckTimestamp = now;
    try {
      const manifest = await this.fetchVersion();
      const remoteVersion = manifest?.version?.trim();
      if (!remoteVersion || remoteVersion === this.currentVersion) {
        return false;
      }

      if (this.readStorage(RELOADED_VERSION_STORAGE_KEY) === remoteVersion) {
        return false;
      }

      this.writeStorage(RELOADED_VERSION_STORAGE_KEY, remoteVersion);
      this.debug.log('New frontend version detected; reloading application', {
        currentVersion: this.currentVersion,
        remoteVersion,
      });
      this.reloadPage(`version:${remoteVersion}`);
      return true;
    } catch (error) {
      this.debug.warn('Version check skipped due to transient network error', error);
      return false;
    } finally {
      this.checkInFlight = false;
    }
  }

  /**
   * Detects whether an unhandled error or router navigation failure was caused by a stale
   * lazy-loaded JS/CSS chunk after a deployment, and triggers a clean one-time page reload.
   */
  handlePotentialChunkError(error: unknown): boolean {
    if (!isChunkLoadError(error)) {
      return false;
    }

    const now = Date.now();
    const lastReloadRaw = this.readStorage(CHUNK_RELOAD_STORAGE_KEY);
    const lastReloadAt = lastReloadRaw ? Number(lastReloadRaw) : 0;
    if (Number.isFinite(lastReloadAt) && now - lastReloadAt < CHUNK_RELOAD_COOLDOWN_MS) {
      return false;
    }

    this.writeStorage(CHUNK_RELOAD_STORAGE_KEY, String(now));
    this.debug.warn('Stale asset chunk detected after deployment; reloading application');
    this.reloadPage('chunk-error');
    return true;
  }

  private readStorage(key: string): string | null {
    try {
      return this.document.defaultView?.sessionStorage?.getItem(key) ?? null;
    } catch {
      return null;
    }
  }

  private writeStorage(key: string, value: string): void {
    try {
      this.document.defaultView?.sessionStorage?.setItem(key, value);
    } catch {
      // Ignore storage quota or privacy-mode restrictions.
    }
  }
}

export function isChunkLoadError(error: unknown): boolean {
  const text = extractErrorText(error);
  if (!text) {
    return false;
  }
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

function extractErrorText(error: unknown): string {
  if (!error) {
    return '';
  }
  if (typeof error === 'string') {
    return error;
  }
  if (error instanceof Error) {
    const causeText =
      'cause' in error && error.cause ? ` ${extractErrorText(error.cause)}` : '';
    return `${error.name} ${error.message}${causeText}`;
  }
  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;
    const name = typeof record['name'] === 'string' ? record['name'] : '';
    const message = typeof record['message'] === 'string' ? record['message'] : '';
    const rejection = record['rejection'] ? extractErrorText(record['rejection']) : '';
    return `${name} ${message} ${rejection}`.trim();
  }
  return '';
}
