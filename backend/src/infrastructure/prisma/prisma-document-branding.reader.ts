import { Injectable } from '@nestjs/common';
import type {
  BrandingSnapshot,
  DocumentBrandingReader,
} from '../../common/branding/document-branding.js';
import type { TenantScope } from '../../common/tenancy/tenant-scope.js';
import { PrismaService } from './prisma.service.js';

@Injectable()
export class PrismaDocumentBrandingReader implements DocumentBrandingReader {
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
