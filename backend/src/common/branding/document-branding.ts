import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  isStorageKey,
  type FileStorage,
} from '../storage/file-storage.port.js';
import type { TenantScope } from '../tenancy/tenant-scope.js';

export const DOCUMENT_BRANDING_READER = Symbol('DOCUMENT_BRANDING_READER');

/** The visual identity of a denomination as a document keeps it: the logo (a storage key) and the color. */
export interface BrandingSnapshot {
  /** Key of the logo in the file storage (branding/<id>/logo-<hash>.png), or null. */
  readonly logoKey: string | null;
  /** #RRGGBB, or null for the default color of the system. */
  readonly primaryColor: string | null;
}

/** Reads the identity the denomination of a scope has chosen. */
export interface DocumentBrandingReader {
  /** What the denomination has chosen now; both null when it chose nothing (or the denomination is not found). */
  findBranding(scope: TenantScope): Promise<BrandingSnapshot>;
}

/** What a PDF needs to dress itself: the color and the bytes of the logo, each optional. */
export interface DocumentBranding {
  readonly accentColor?: string;
  readonly logo?: Buffer;
}

/**
 * Gives every printed document (certificates, cards, reports) its logo and color. A document is never refused for
 * lack of them: when the logo file is missing or the storage is down, it is printed without it.
 */
@Injectable()
export class DocumentBrandingService {
  constructor(
    @Inject(DOCUMENT_BRANDING_READER)
    private readonly reader: DocumentBrandingReader,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** The identity the denomination has chosen now: what a certificate keeps in its snapshot when it is issued. */
  snapshotOf(scope: TenantScope): Promise<BrandingSnapshot> {
    return this.reader.findBranding(scope);
  }

  /**
   * The branding a document was issued with (its snapshot): a reprint is identical to the original even if the
   * denomination changed its logo since.
   */
  async forSnapshot(
    branding: BrandingSnapshot | undefined,
  ): Promise<DocumentBranding> {
    if (!branding) {
      return {};
    }
    const logo = await this.logoOf(branding.logoKey);
    return {
      ...(branding.primaryColor ? { accentColor: branding.primaryColor } : {}),
      ...(logo ? { logo } : {}),
    };
  }

  /** The branding the denomination has now: for documents that are not stored as a snapshot (cards, reports). */
  async current(scope: TenantScope): Promise<DocumentBranding> {
    return this.forSnapshot(await this.reader.findBranding(scope));
  }

  private async logoOf(key: string | null): Promise<Buffer | undefined> {
    if (!key || !isStorageKey(key)) {
      return undefined;
    }
    try {
      return (await this.storage.read(key)) ?? undefined;
    } catch {
      return undefined;
    }
  }
}
