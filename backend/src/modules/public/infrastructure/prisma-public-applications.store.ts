import { Injectable } from '@nestjs/common';
import { BusinessRuleException } from '../../../common/errors/domain.exception.js';
import { parseIsoDate } from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  NewApplication,
  PublicApplicationsStore,
  StoredStatus,
} from '../application/ports/public-applications.store.js';

@Injectable()
export class PrismaPublicApplicationsStore implements PublicApplicationsStore {
  constructor(private readonly prisma: PrismaService) {}

  async trackingHashExists(hash: string): Promise<boolean> {
    return (
      (await this.prisma.membershipApplication.count({
        where: { trackingCodeHash: hash },
      })) > 0
    );
  }

  async create(
    application: NewApplication,
    transaction: Transaction,
  ): Promise<number> {
    const client = clientOf(this.prisma, transaction);
    const documentType = await client.documentType.findUnique({
      where: { code: application.documentTypeCode },
      select: { id: true },
    });
    if (!documentType) {
      throw new BusinessRuleException(
        'El tipo de documento no es válido.',
        'INVALID_CATALOG_VALUE',
      );
    }

    const created = await client.membershipApplication.create({
      data: {
        denominationId: application.denominationId,
        congregationId: application.congregationId,
        policyId: application.policyId,
        trackingCodeHash: application.trackingCodeHash,
        status: 'PENDING',
        documentTypeId: documentType.id,
        documentNumber: application.documentNumber,
        firstName: application.firstName,
        lastName: application.lastName,
        email: application.email,
        phone: application.phone,
        birthDate: parseIsoDate(application.birthDate),
        guardianName: application.guardianName,
        guardianDocument: application.guardianDocument,
        formData: application.formData as unknown as Prisma.InputJsonObject,
        consentedAt: application.consentedAt,
      },
      select: { id: true },
    });
    return created.id;
  }

  async findStatusByHash(hash: string): Promise<StoredStatus | null> {
    return this.prisma.membershipApplication.findUnique({
      where: { trackingCodeHash: hash },
      select: { status: true, createdAt: true, reviewedAt: true },
    });
  }
}
