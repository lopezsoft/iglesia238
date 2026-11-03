import { Injectable } from '@nestjs/common';
import { toIsoDateOrNull } from '../../../common/mappers/value-mappers.js';
import { formatMemberCode } from '../../../common/numbering/document-numbering.service.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { CertificateMemberReader } from '../application/ports/certificate-member.reader.js';
import type { CertificateMember } from '../application/certificate.models.js';
import { PERSON_NAME_SELECT, composePersonName } from './person-name.js';

const MEMBER_SELECT = {
  id: true,
  congregationId: true,
  status: true,
  joinedOn: true,
  isBaptized: true,
  waterBaptismOn: true,
  person: {
    select: {
      ...PERSON_NAME_SELECT,
      documentNumber: true,
      documentType: { select: { code: true } },
    },
  },
  congregation: { select: { code: true } },
  memberRegistryEntries: {
    where: { endedOn: null },
    orderBy: { startedOn: 'desc' },
    take: 1,
    select: { memberNumber: true, congregationId: true },
  },
} satisfies Prisma.MemberSelect;

type MemberRow = Prisma.MemberGetPayload<{ select: typeof MEMBER_SELECT }>;

@Injectable()
export class PrismaCertificateMemberReader
  extends TenantScopedRepository
  implements CertificateMemberReader
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findMember(
    scope: TenantScope,
    memberId: number,
  ): Promise<CertificateMember | null> {
    const row = await this.prisma.member.findFirst({
      where: this.scoped(scope, { id: memberId, deletedAt: null }),
      select: MEMBER_SELECT,
    });
    return row ? this.toMember(row) : null;
  }

  private toMember(row: MemberRow): CertificateMember {
    const entry = row.memberRegistryEntries[0];
    // A registry entry of another sede (the member moved) does not give a number in this one.
    const memberNumber =
      entry && entry.congregationId === row.congregationId
        ? entry.memberNumber
        : null;
    return {
      id: row.id,
      congregationId: row.congregationId,
      status: row.status,
      fullName: composePersonName(row.person),
      code:
        memberNumber === null
          ? ''
          : formatMemberCode(row.congregation.code, memberNumber),
      memberNumber,
      documentTypeCode: row.person.documentType?.code ?? null,
      documentNumber: row.person.documentNumber,
      joinedOn: toIsoDateOrNull(row.joinedOn),
      isBaptized: row.isBaptized,
      waterBaptismOn: toIsoDateOrNull(row.waterBaptismOn),
    };
  }
}
