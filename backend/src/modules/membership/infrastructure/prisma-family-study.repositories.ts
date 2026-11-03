import { Injectable } from '@nestjs/common';
import { toIsoDateOrNull } from '../../../common/mappers/value-mappers.js';
import { bogotaDateOf } from '../../../common/time/bogota-time.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { ageOn } from '../application/member-rules.js';
import type {
  FamilyRelationRow,
  FamilyRelationType,
  FamilyRelationView,
  PersonStudyView,
} from '../application/member.models.js';
import type {
  FamilyRepository,
  NewStudyRecord,
  StudyRepository,
} from '../application/ports/member-details.repositories.js';
import { maskDocument } from '../application/person-text.js';
import {
  LATEST_REGISTRY_ENTRY,
  memberCodeOf,
  personNames,
} from './member-queries.js';

@Injectable()
export class PrismaFamilyRepository implements FamilyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(
    scope: TenantScope,
    personId: number,
  ): Promise<FamilyRelationView[]> {
    const rows = await this.prisma.familyRelation.findMany({
      where: { personId, denominationId: scope.denominationId },
      orderBy: { id: 'asc' },
      include: {
        relative: {
          include: {
            documentType: { select: { code: true } },
            member: {
              include: {
                congregation: { select: { name: true } },
                memberRegistryEntries: LATEST_REGISTRY_ENTRY,
              },
            },
          },
        },
      },
    });
    const today = bogotaDateOf(new Date());
    return rows.map(({ id, type, relative }) => {
      const member =
        relative.member && relative.member.deletedAt === null
          ? relative.member
          : null;
      // Only a member the user can open is linked: another sede's member is shown without a link.
      const visible =
        member !== null &&
        (scope.congregationId === null ||
          member.congregationId === scope.congregationId);
      return {
        id,
        type,
        relativeId: relative.id,
        fullName: personNames(relative),
        documentTypeCode: relative.documentType?.code ?? null,
        maskedDocument: maskDocument(
          relative.documentType?.code ?? null,
          relative.documentNumber,
        ),
        age: ageOn(toIsoDateOrNull(relative.birthDate), today),
        memberId: visible ? member.id : null,
        memberCode: member ? memberCodeOf(member.memberRegistryEntries) : null,
        congregationName: visible ? member.congregation.name : null,
        memberStatus: member?.status ?? null,
      };
    });
  }

  async rowsOf(
    scope: TenantScope,
    personId: number,
    transaction?: Transaction,
  ): Promise<FamilyRelationRow[]> {
    return clientOf(this.prisma, transaction).familyRelation.findMany({
      where: { personId, denominationId: scope.denominationId },
      select: { id: true, personId: true, relativeId: true, type: true },
      orderBy: { id: 'asc' },
    });
  }

  async add(
    scope: TenantScope,
    personId: number,
    relativeId: number,
    type: FamilyRelationType,
    transaction: Transaction,
  ): Promise<number> {
    const created = await clientOf(
      this.prisma,
      transaction,
    ).familyRelation.create({
      data: {
        denominationId: scope.denominationId,
        personId,
        relativeId,
        type,
      },
      select: { id: true },
    });
    return created.id;
  }

  async remove(
    scope: TenantScope,
    relationId: number,
    transaction: Transaction,
  ): Promise<void> {
    await clientOf(this.prisma, transaction).familyRelation.deleteMany({
      where: { id: relationId, denominationId: scope.denominationId },
    });
  }
}

@Injectable()
export class PrismaStudyRepository implements StudyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(scope: TenantScope, personId: number): Promise<PersonStudyView[]> {
    const rows = await this.prisma.personStudy.findMany({
      where: { personId, denominationId: scope.denominationId },
      include: {
        study: { include: { studyType: { select: { code: true } } } },
      },
      orderBy: [{ year: 'desc' }, { id: 'desc' }],
    });
    return rows.map((row) => ({
      id: row.id,
      studyTypeCode: row.study.studyType.code,
      name: row.study.name,
      institution: row.institution,
      status: row.status,
      year: row.year,
    }));
  }

  async add(
    scope: TenantScope,
    personId: number,
    record: NewStudyRecord,
    transaction: Transaction,
  ): Promise<number | null> {
    const client = clientOf(this.prisma, transaction);
    const { denominationId } = scope;
    const existing = await client.study.findUnique({
      where: {
        denominationId_studyTypeId_name: {
          denominationId,
          studyTypeId: record.studyTypeId,
          name: record.name,
        },
      },
      select: { id: true },
    });
    const studyId =
      existing?.id ??
      (
        await client.study.create({
          data: {
            denominationId,
            studyTypeId: record.studyTypeId,
            name: record.name,
          },
          select: { id: true },
        })
      ).id;

    const repeated = await client.personStudy.findUnique({
      where: { personId_studyId: { personId, studyId } },
      select: { id: true },
    });
    if (repeated) {
      return null;
    }
    const created = await client.personStudy.create({
      data: {
        denominationId,
        personId,
        studyId,
        status: record.status,
        institution: record.institution,
        year: record.year,
      },
      select: { id: true },
    });
    return created.id;
  }

  async remove(
    scope: TenantScope,
    personId: number,
    personStudyId: number,
    transaction: Transaction,
  ): Promise<boolean> {
    const result = await clientOf(
      this.prisma,
      transaction,
    ).personStudy.deleteMany({
      where: {
        id: personStudyId,
        personId,
        denominationId: scope.denominationId,
      },
    });
    return result.count > 0;
  }
}
