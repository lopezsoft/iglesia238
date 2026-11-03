import { Injectable } from '@nestjs/common';
import { parseIsoDate } from '../../../common/mappers/value-mappers.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { TenantScopedRepository } from '../../../common/tenancy/tenant-scoped.repository.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { Letterhead } from '../application/certificate-document.js';
import type {
  ResolvedSigners,
  Signer,
} from '../application/certificate.models.js';
import type { CertificateContextReader } from '../application/ports/certificate-context.reader.js';
import { PERSON_NAME_SELECT, composePersonName } from './person-name.js';

interface RoleHolder {
  readonly userId: number;
  readonly displayName: string | null;
}

@Injectable()
export class PrismaCertificateContextReader
  extends TenantScopedRepository
  implements CertificateContextReader
{
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async findLetterhead(scope: TenantScope): Promise<Letterhead | null> {
    const congregation = await this.prisma.congregation.findFirst({
      where: {
        id: scope.requireCongregationId(),
        denominationId: scope.denominationId,
        deletedAt: null,
      },
      select: {
        name: true,
        denomination: { select: { name: true } },
        legalEntity: { select: { legalName: true, taxId: true } },
        municipality: { select: { name: true } },
        district: { select: { number: true } },
      },
    });
    if (!congregation) {
      return null;
    }
    const cityName = congregation.municipality?.name ?? '';
    return {
      denominationName: congregation.denomination.name,
      legalName: congregation.legalEntity.legalName,
      taxId: congregation.legalEntity.taxId,
      congregationName: congregation.name,
      cityName,
      locationLine: [
        congregation.name,
        cityName,
        congregation.district ? `Distrito ${congregation.district.number}` : '',
      ]
        .filter((part) => part !== '')
        .join(' · '),
    };
  }

  async findSigners(
    scope: TenantScope,
    issuerUserId: number,
    today: string,
  ): Promise<ResolvedSigners> {
    const [pastor, secretary] = await Promise.all([
      this.findPastor(scope, today),
      this.findSecretary(scope, issuerUserId),
    ]);
    return { pastor, secretary };
  }

  async findUserName(userId: number): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { displayName: true },
    });
    return user?.displayName ?? null;
  }

  /** The person of the open pastoral term of the sede, or else the person of the PASTOR role holder. */
  private async findPastor(
    scope: TenantScope,
    today: string,
  ): Promise<Signer | null> {
    const day = parseIsoDate(today);
    const term = await this.prisma.pastoralTerm.findFirst({
      where: this.scoped(scope, {
        startedOn: { lte: day },
        OR: [{ endedOn: null }, { endedOn: { gte: day } }],
      }),
      orderBy: { startedOn: 'desc' },
      select: { pastor: { select: { id: true, ...PERSON_NAME_SELECT } } },
    });
    if (term) {
      return { personId: term.pastor.id, name: composePersonName(term.pastor) };
    }

    const [holder] = await this.roleHolders(scope, 'PASTOR');
    if (!holder) {
      return null;
    }
    const person = await this.personOfUser(scope, holder.userId);
    return person
      ? { personId: person.id, name: composePersonName(person) }
      : null;
  }

  /** The issuer when it holds the SECRETARY role of the sede; otherwise the first holder. */
  private async findSecretary(
    scope: TenantScope,
    issuerUserId: number,
  ): Promise<{ personId: number | null; name: string } | null> {
    const holders = await this.roleHolders(scope, 'SECRETARY');
    const chosen =
      holders.find((holder) => holder.userId === issuerUserId) ?? holders[0];
    if (!chosen) {
      return null;
    }
    const person = await this.personOfUser(scope, chosen.userId);
    const name = person
      ? composePersonName(person)
      : (chosen.displayName ?? '').trim();
    return name === '' ? null : { personId: person?.id ?? null, name };
  }

  /** Active holders of a role that covers the sede: assigned to it or to the whole denomination. */
  private async roleHolders(
    scope: TenantScope,
    roleCode: 'PASTOR' | 'SECRETARY',
  ): Promise<RoleHolder[]> {
    const rows = await this.prisma.userRole.findMany({
      where: {
        revokedAt: null,
        role: { code: roleCode },
        user: { isActive: true, deletedAt: null },
        OR: [
          {
            scope: 'CONGREGATION',
            denominationId: scope.denominationId,
            congregationId: scope.requireCongregationId(),
          },
          { scope: 'DENOMINATION', denominationId: scope.denominationId },
        ],
      },
      orderBy: { id: 'asc' },
      select: { user: { select: { id: true, displayName: true } } },
    });
    return rows.map((row) => ({
      userId: row.user.id,
      displayName: row.user.displayName,
    }));
  }

  private personOfUser(scope: TenantScope, userId: number) {
    return this.prisma.person.findFirst({
      where: { denominationId: scope.denominationId, userId, deletedAt: null },
      select: { id: true, ...PERSON_NAME_SELECT },
    });
  }
}
