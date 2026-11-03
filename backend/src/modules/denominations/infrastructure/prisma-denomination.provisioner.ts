import { Injectable } from '@nestjs/common';
import { parseIsoDate } from '../../../common/mappers/value-mappers.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { DenominationTemplate } from '../application/denomination-template.js';
import type { DenominationProvisioner } from '../application/denomination.repository.port.js';

/** Writes the template of a new denomination with the transaction of the use case that creates it. */
@Injectable()
export class PrismaDenominationProvisioner implements DenominationProvisioner {
  constructor(private readonly prisma: PrismaService) {}

  async provision(
    denominationId: number,
    template: DenominationTemplate,
    policyEffectiveFrom: string,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);

    const fund = await client.fund.create({
      data: { denominationId, name: template.fundName },
      select: { id: true },
    });

    // Parents come before their children in the template, so their ids are known when needed.
    const accountIds = new Map<string, number>();
    for (const account of template.accounts) {
      const parentId = account.parentCode
        ? this.idOf(accountIds, account.parentCode)
        : null;
      const created = await client.account.create({
        data: {
          denominationId,
          parentId,
          defaultFundId: account.isPostable ? fund.id : null,
          code: account.code,
          name: account.name,
          nature: account.nature,
          isPostable: account.isPostable,
        },
        select: { id: true },
      });
      accountIds.set(account.code, created.id);
    }

    await client.contributionType.createMany({
      data: template.contributionTypes.map((type) => ({
        denominationId,
        category: type.category,
        code: type.code,
        name: type.name,
        accountId: this.idOf(accountIds, type.accountCode),
      })),
    });
    await client.certificateType.createMany({
      data: template.certificateTypes.map((type) => ({
        denominationId,
        code: type.code,
        name: type.name,
      })),
    });
    await client.pastoralRank.createMany({
      data: template.pastoralRanks.map((name) => ({ denominationId, name })),
    });
    await client.churchPosition.createMany({
      data: template.churchPositions.map((name) => ({ denominationId, name })),
    });
    await client.privacyPolicy.create({
      data: {
        denominationId,
        version: template.privacyPolicy.version,
        content: template.privacyPolicy.content,
        effectiveFrom: parseIsoDate(policyEffectiveFrom),
        status: 'DRAFT',
      },
    });
  }

  private idOf(ids: ReadonlyMap<string, number>, code: string): number {
    const id = ids.get(code);
    if (id === undefined) {
      // A template mistake, found by the first test that provisions a denomination.
      throw new Error(`The template references the unknown account ${code}`);
    }
    return id;
  }
}
