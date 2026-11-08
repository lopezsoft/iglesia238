import { Injectable } from '@nestjs/common';
import { parseIsoDate } from '../../../common/mappers/value-mappers.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type {
  CertificateDonationReader,
  DonationLineRecord,
} from '../application/ports/certificate-donation.reader.js';

/** Order of the concepts on the certificate: the usual ones first. */
const CATEGORY_ORDER: Readonly<Record<string, number>> = {
  TITHE: 0,
  OFFERING: 1,
  FIRST_FRUITS: 2,
  VOW: 3,
  OTHER: 4,
};

@Injectable()
export class PrismaCertificateDonationReader implements CertificateDonationReader {
  constructor(private readonly prisma: PrismaService) {}

  async summarize(
    scope: TenantScope,
    memberId: number,
    range: { readonly from: string; readonly to: string },
  ): Promise<readonly DonationLineRecord[]> {
    if (scope.congregationId === null) {
      return [];
    }
    const [congregation, member] = await Promise.all([
      this.prisma.congregation.findFirst({
        where: {
          id: scope.congregationId,
          denominationId: scope.denominationId,
        },
        select: { legalEntityId: true },
      }),
      this.prisma.member.findFirst({
        where: {
          id: memberId,
          denominationId: scope.denominationId,
          deletedAt: null,
        },
        select: { personId: true },
      }),
    ]);
    if (!congregation || !member) {
      return [];
    }

    const groups = await this.prisma.contribution.groupBy({
      by: ['contributionTypeId'],
      where: {
        denominationId: scope.denominationId,
        personId: member.personId,
        status: 'RECORDED',
        receivedOn: {
          gte: parseIsoDate(range.from),
          lte: parseIsoDate(range.to),
        },
        // The certificate is issued by the legal entity (its NIT is in the letterhead): its sedes only.
        congregation: { legalEntityId: congregation.legalEntityId },
      },
      _sum: { amount: true },
      _count: { _all: true },
    });
    if (groups.length === 0) {
      return [];
    }

    const types = await this.prisma.contributionType.findMany({
      where: {
        denominationId: scope.denominationId,
        id: { in: groups.map((group) => group.contributionTypeId) },
      },
      select: { id: true, name: true, category: true },
    });
    const typeById = new Map(types.map((type) => [type.id, type]));

    return groups
      .flatMap((group) => {
        const type = typeById.get(group.contributionTypeId);
        return type
          ? [
              {
                order: CATEGORY_ORDER[type.category] ?? 99,
                concept: type.name,
                receipts: group._count._all,
                amountCents: new Prisma.Decimal(group._sum.amount ?? 0)
                  .mul(100)
                  .round()
                  .toNumber(),
              },
            ]
          : [];
      })
      .sort(
        (a, b) => a.order - b.order || a.concept.localeCompare(b.concept, 'es'),
      )
      .map(({ concept, receipts, amountCents }) => ({
        concept,
        receipts,
        amountCents,
      }));
  }
}
