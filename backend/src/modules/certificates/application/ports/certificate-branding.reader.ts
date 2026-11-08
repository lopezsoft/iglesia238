import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import type { BrandingSnapshot } from '../certificate-document.js';

export const CERTIFICATE_BRANDING_READER = Symbol(
  'CERTIFICATE_BRANDING_READER',
);

/** Reads the visual identity of the denomination of a scope: the logo (a storage key) and the color. */
export interface CertificateBrandingReader {
  /** What the denomination has chosen now; both null when it chose nothing (or the denomination is not found). */
  findBranding(scope: TenantScope): Promise<BrandingSnapshot>;
}
