import { Inject, Injectable } from '@nestjs/common';
import {
  FILE_STORAGE,
  isStorageKey,
  type FileStorage,
} from '../../../common/storage/file-storage.port.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { BrandingSnapshot } from './certificate-document.js';
import {
  CERTIFICATE_BRANDING_READER,
  type CertificateBrandingReader,
} from './ports/certificate-branding.reader.js';

/** What a PDF needs to dress itself: the color and the bytes of the logo, each optional. */
export interface DocumentBranding {
  readonly accentColor?: string;
  readonly logo?: Buffer;
}

/**
 * Gives the documents their logo and color. A document is never refused for lack of them: when the logo file is
 * missing or the storage is down, the document is printed without it.
 */
@Injectable()
export class DocumentBrandingService {
  constructor(
    @Inject(CERTIFICATE_BRANDING_READER)
    private readonly reader: CertificateBrandingReader,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /**
   * The branding a certificate was issued with (its snapshot): a reprint is identical to the original even if the
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

  /** The branding the denomination has now: for documents that are not stored as a snapshot (the membership card). */
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
