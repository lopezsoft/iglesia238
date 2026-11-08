import { Injectable } from '@nestjs/common';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { BrandingSnapshot } from '../application/certificate-document.js';
import type { CertificateBrandingReader } from '../application/ports/certificate-branding.reader.js';

@Injectable()
export class PrismaCertificateBrandingReader implements CertificateBrandingReader {
  constructor(private readonly prisma: PrismaService) {}

  async findBranding(scope: TenantScope): Promise<BrandingSnapshot> {
    const row = await this.prisma.denomination.findFirst({
      where: { id: scope.denominationId, deletedAt: null },
      select: { logoPath: true, primaryColor: true },
    });
    return {
      logoKey: row?.logoPath ?? null,
      primaryColor: row?.primaryColor ?? null,
    };
  }
}
