import { Injectable } from '@nestjs/common';
import { NotFoundDomainException } from '../../../common/errors/domain.exception.js';
import {
  parseIsoDate,
  toIsoDate,
  toIsoDateTime,
} from '../../../common/mappers/value-mappers.js';
import {
  type Page,
  buildPage,
  toSkipTake,
} from '../../../common/pagination/page.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { clientOf } from '../../../infrastructure/prisma/prisma-transaction.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import {
  type AttendanceCountsUpdate,
  type AttendanceFilter,
  type AttendanceSessionRecord,
  type CatalogEntry,
  type NamedOption,
  type NewAttendanceSession,
  sessionTotal,
} from '../application/attendance.models.js';
import type { AttendanceRepository } from '../application/attendance.repository.js';

const sessionInclude = {
  congregation: { select: { name: true } },
  meetingType: { select: { code: true, name: true } },
  recordedBy: { select: { displayName: true } },
  attendanceCounts: {
    select: { headcount: true, category: { select: { id: true, code: true } } },
  },
} satisfies Prisma.AttendanceSessionInclude;

type SessionRow = Prisma.AttendanceSessionGetPayload<{
  include: typeof sessionInclude;
}>;

function toRecord(row: SessionRow): AttendanceSessionRecord {
  const attendanceCounts = [...row.attendanceCounts]
    .sort((a, b) => a.category.id - b.category.id)
    .map((count) => ({
      categoryCode: count.category.code,
      headcount: count.headcount,
    }));
  return {
    id: row.id,
    denominationId: row.denominationId,
    congregationId: row.congregationId,
    congregationName: row.congregation.name,
    meetingTypeCode: row.meetingType.code,
    meetingTypeName: row.meetingType.name,
    sessionDate: toIsoDate(row.sessionDate),
    attendanceCounts,
    total: sessionTotal(attendanceCounts),
    recordedBy: row.recordedBy?.displayName ?? null,
    recordedAt: toIsoDateTime(row.recordedAt),
  };
}

/** Prisma adapter of the attendance port. Every tenant query carries the scope. */
@Injectable()
export class PrismaAttendanceRepository implements AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  listMeetingTypes(): Promise<CatalogEntry[]> {
    return this.prisma.meetingType.findMany({
      select: { code: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  listCategories(): Promise<CatalogEntry[]> {
    return this.prisma.attendanceCategory.findMany({
      select: { code: true, name: true },
      orderBy: { id: 'asc' },
    });
  }

  listCongregations(scope: TenantScope): Promise<NamedOption[]> {
    return this.prisma.congregation.findMany({
      where: {
        denominationId: scope.denominationId,
        isActive: true,
        deletedAt: null,
        ...(scope.congregationId === null ? {} : { id: scope.congregationId }),
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async findCongregation(
    scope: TenantScope,
    id: number,
  ): Promise<NamedOption | null> {
    if (scope.congregationId !== null && scope.congregationId !== id) {
      return null;
    }
    return this.prisma.congregation.findFirst({
      where: {
        id,
        denominationId: scope.denominationId,
        isActive: true,
        deletedAt: null,
      },
      select: { id: true, name: true },
    });
  }

  async findById(
    scope: TenantScope,
    id: number,
  ): Promise<AttendanceSessionRecord | null> {
    const row = await this.prisma.attendanceSession.findFirst({
      where: { id, ...scope.where() },
      include: sessionInclude,
    });
    return row ? toRecord(row) : null;
  }

  async findByKey(
    scope: TenantScope,
    key: {
      congregationId: number;
      meetingTypeCode: string;
      sessionDate: string;
    },
  ): Promise<AttendanceSessionRecord | null> {
    const row = await this.prisma.attendanceSession.findFirst({
      where: {
        ...scope.where(),
        congregationId: key.congregationId,
        meetingType: { code: key.meetingTypeCode },
        sessionDate: parseIsoDate(key.sessionDate),
      },
      include: sessionInclude,
    });
    return row ? toRecord(row) : null;
  }

  async list(
    scope: TenantScope,
    filter: AttendanceFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<AttendanceSessionRecord>> {
    const where = this.where(scope, filter);
    const [rows, total] = await Promise.all([
      this.prisma.attendanceSession.findMany({
        where,
        include: sessionInclude,
        orderBy: [{ sessionDate: 'desc' }, { id: 'desc' }],
        ...toSkipTake(page),
      }),
      this.prisma.attendanceSession.count({ where }),
    ]);
    return buildPage(rows.map(toRecord), total, page);
  }

  async listAll(
    scope: TenantScope,
    filter: AttendanceFilter,
    limit: number,
  ): Promise<AttendanceSessionRecord[]> {
    const rows = await this.prisma.attendanceSession.findMany({
      where: this.where(scope, filter),
      include: sessionInclude,
      orderBy: [{ sessionDate: 'asc' }, { id: 'asc' }],
      take: limit,
    });
    return rows.map(toRecord);
  }

  async create(
    scope: TenantScope,
    data: NewAttendanceSession,
    transaction: Transaction,
  ): Promise<AttendanceSessionRecord> {
    const client = clientOf(this.prisma, transaction);
    const [meetingType, categories] = await Promise.all([
      client.meetingType.findUniqueOrThrow({
        where: { code: data.meetingTypeCode },
        select: { id: true },
      }),
      this.categoryIds(
        client,
        data.attendanceCounts.map((c) => c.categoryCode),
      ),
    ]);
    const created = await client.attendanceSession.create({
      data: {
        denominationId: scope.denominationId,
        congregationId: data.congregationId,
        meetingTypeId: meetingType.id,
        sessionDate: parseIsoDate(data.sessionDate),
        recordedById: data.recordedById,
        recordedAt: data.recordedAt,
        attendanceCounts: {
          create: data.attendanceCounts.map((count) => ({
            categoryId: categories.get(count.categoryCode) as number,
            headcount: count.headcount,
          })),
        },
      },
      include: sessionInclude,
    });
    return toRecord(created);
  }

  async replaceCounts(
    scope: TenantScope,
    id: number,
    data: AttendanceCountsUpdate,
    transaction: Transaction,
  ): Promise<AttendanceSessionRecord> {
    const client = clientOf(this.prisma, transaction);
    const updated = await client.attendanceSession.updateMany({
      where: { id, ...scope.where() },
      data: { recordedById: data.recordedById, recordedAt: data.recordedAt },
    });
    if (updated.count === 0) {
      throw new NotFoundDomainException('La sesión no existe.');
    }
    const categories = await this.categoryIds(
      client,
      data.attendanceCounts.map((count) => count.categoryCode),
    );
    await client.attendanceCount.deleteMany({ where: { sessionId: id } });
    await client.attendanceCount.createMany({
      data: data.attendanceCounts.map((count) => ({
        sessionId: id,
        categoryId: categories.get(count.categoryCode) as number,
        headcount: count.headcount,
      })),
    });
    const row = await client.attendanceSession.findFirstOrThrow({
      where: { id, ...scope.where() },
      include: sessionInclude,
    });
    return toRecord(row);
  }

  async delete(
    scope: TenantScope,
    id: number,
    transaction: Transaction,
  ): Promise<void> {
    const client = clientOf(this.prisma, transaction);
    const session = await client.attendanceSession.findFirst({
      where: { id, ...scope.where() },
      select: { id: true },
    });
    if (!session) {
      throw new NotFoundDomainException('La sesión no existe.');
    }
    await client.attendanceCount.deleteMany({ where: { sessionId: id } });
    await client.attendanceSession.delete({ where: { id } });
  }

  private where(
    scope: TenantScope,
    filter: AttendanceFilter,
  ): Prisma.AttendanceSessionWhereInput {
    return {
      ...scope.where(),
      ...(filter.meetingTypeCode
        ? { meetingType: { code: filter.meetingTypeCode } }
        : {}),
      ...(filter.from || filter.to
        ? {
            sessionDate: {
              ...(filter.from ? { gte: parseIsoDate(filter.from) } : {}),
              ...(filter.to ? { lte: parseIsoDate(filter.to) } : {}),
            },
          }
        : {}),
    };
  }

  private async categoryIds(
    client: Prisma.TransactionClient,
    codes: readonly string[],
  ): Promise<Map<string, number>> {
    const rows = await client.attendanceCategory.findMany({
      where: { code: { in: [...codes] } },
      select: { id: true, code: true },
    });
    return new Map(rows.map((row) => [row.code, row.id]));
  }
}
