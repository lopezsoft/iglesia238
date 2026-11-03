import { Injectable } from '@nestjs/common';
import type { Transaction } from '../../../common/persistence/transaction.js';
import { formatScopeKey } from '../../../common/tenancy/scope-key.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  DuplicateRegistrationEmailError,
  type CongregationRegistrationStore,
  type RegistrationCommand,
  type RegistrationLegalEntity,
  type RegistrationResult,
} from '../application/ports/congregation-registration.store.js';

/**
 * Writes the self-registration of a congregation. The roles use the same shape as any other grant
 * (UserRole.scope CONGREGATION, denominationId + congregationId, scopeKey C:<id>, activeKey default 1),
 * which the CHECK constraints of user_roles require.
 */
@Injectable()
export class PrismaCongregationRegistrationStore implements CongregationRegistrationStore {
  constructor(private readonly prisma: PrismaService) {}

  findActiveLegalEntity(id: number): Promise<RegistrationLegalEntity | null> {
    return this.prisma.legalEntity.findFirst({
      where: {
        id,
        isActive: true,
        deletedAt: null,
        denomination: { isActive: true, deletedAt: null },
        country: { isActive: true },
      },
      select: {
        id: true,
        denominationId: true,
        legalName: true,
        countryId: true,
      },
    });
  }

  listCongregationIdentifiers(
    denominationId: number,
  ): Promise<readonly { name: string; code: string }[]> {
    // Deleted rows keep their name and code occupied: both are unique for every row of the denomination.
    return this.prisma.congregation.findMany({
      where: { denominationId },
      select: { name: true, code: true },
    });
  }

  async findMunicipalityId(
    countryId: number,
    code: string,
  ): Promise<number | null> {
    const municipality = await this.prisma.municipality.findFirst({
      where: { code, region: { countryId } },
      select: { id: true },
    });
    return municipality?.id ?? null;
  }

  async emailExists(email: string): Promise<boolean> {
    return (await this.prisma.user.count({ where: { email } })) > 0;
  }

  async register(
    command: RegistrationCommand,
    transaction: Transaction,
  ): Promise<RegistrationResult> {
    const client = clientOf(this.prisma, transaction);
    const { congregation, manager } = command;

    // The user goes first: a taken e-mail is the only expected failure and must leave nothing behind.
    let userId: number;
    try {
      const user = await client.user.create({
        data: {
          email: manager.email,
          displayName: manager.displayName,
          passwordHash: manager.passwordHash,
          emailVerifiedAt: null,
        },
        select: { id: true },
      });
      userId = user.id;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new DuplicateRegistrationEmailError();
      }
      throw error;
    }

    const created = await client.congregation.create({
      data: {
        denominationId: congregation.denominationId,
        legalEntityId: congregation.legalEntityId,
        code: congregation.code,
        name: congregation.name,
        municipalityId: congregation.municipalityId,
        address: congregation.address,
        phone: congregation.phone,
        email: congregation.email,
        isActive: true,
        acceptsApplications: true,
      },
      select: { id: true },
    });

    const roles = await client.role.findMany({
      where: { code: { in: [...command.roleCodes] } },
      select: { id: true, code: true },
    });
    if (roles.length !== command.roleCodes.length) {
      // The catalog is created by the seed; without it nothing can be granted.
      throw new Error('Role catalog is incomplete: run the seed');
    }
    const assignments: { id: number; roleCode: string }[] = [];
    for (const roleCode of command.roleCodes) {
      const role = roles.find((row) => row.code === roleCode);
      const assignment = await client.userRole.create({
        data: {
          userId,
          roleId: (role as { id: number }).id,
          scope: 'CONGREGATION',
          denominationId: congregation.denominationId,
          congregationId: created.id,
          scopeKey: formatScopeKey('CONGREGATION', created.id),
          grantedById: null,
        },
        select: { id: true },
      });
      assignments.push({ id: assignment.id, roleCode });
    }

    await client.userToken.create({
      data: {
        userId,
        type: 'EMAIL_VERIFICATION',
        tokenHash: command.verification.tokenHash,
        expiresAt: command.verification.expiresAt,
      },
    });

    return { congregationId: created.id, userId, assignments };
  }
}
