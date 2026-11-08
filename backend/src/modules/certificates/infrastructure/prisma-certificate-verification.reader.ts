import { Injectable } from '@nestjs/common';
import { toIsoDate } from '../../../common/mappers/value-mappers.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { CertificateSnapshot } from '../application/certificate-document.js';
import type {
  CertificateVerificationReader,
  VerifiableCertificateRecord,
} from '../application/ports/certificate-verification.js';

/** Reads a certificate by id without a tenant scope. Only the public verification uses it, behind a signed token. */
@Injectable()
export class PrismaCertificateVerificationReader implements CertificateVerificationReader {
  constructor(private readonly prisma: PrismaService) {}

  async findById(
    certificateId: number,
  ): Promise<VerifiableCertificateRecord | null> {
    const row = await this.prisma.certificate.findUnique({
      where: { id: certificateId },
      select: {
        snapshot: true,
        issuedOn: true,
        expiresOn: true,
        voidedAt: true,
      },
    });
    if (!row) {
      return null;
    }
    return {
      snapshot: row.snapshot as unknown as CertificateSnapshot,
      issuedOn: toIsoDate(row.issuedOn),
      expiresOn: row.expiresOn ? toIsoDate(row.expiresOn) : null,
      voidedAt: row.voidedAt,
    };
  }
}
