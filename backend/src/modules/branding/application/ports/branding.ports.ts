import type { Transaction } from '../../../../common/persistence/transaction.js';
import type { BrandingChanges, BrandingRecord } from '../branding.models.js';

export const BRANDING_REPOSITORY = Symbol('BRANDING_REPOSITORY');
export const LOGO_EMBEDDING_PROBE = Symbol('LOGO_EMBEDDING_PROBE');

/** Persistence of the visual identity: it lives in the denomination, which is the tenant itself. */
export interface BrandingRepository {
  find(denominationId: number): Promise<BrandingRecord | null>;
  /** Applies the changes; null when the denomination does not exist. */
  update(
    denominationId: number,
    changes: BrandingChanges,
    transaction: Transaction,
  ): Promise<BrandingRecord | null>;
}

/**
 * Tells whether a logo can really be placed in a PDF. A picture that passes the checks of its header can still be
 * one the PDF library cannot embed (an interlaced PNG, for instance): better to learn it at upload than when the
 * first certificate is printed.
 */
export interface LogoEmbeddingProbe {
  canEmbed(bytes: Buffer): Promise<boolean>;
}
