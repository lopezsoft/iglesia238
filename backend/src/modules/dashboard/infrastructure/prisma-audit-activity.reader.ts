import { Injectable } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import { rangeBounds } from '../application/period-window.js';
import type { DateRange } from '../application/dashboard.types.js';
import type {
  AuditActivityReader,
  RecentAuditRow,
  StatsScope,
} from '../application/ports/dashboard-stats.reader.js';

const SYSTEM_USER_NAME = 'Sistema';
const PLATFORM_LABEL = 'Plataforma';
/** A denomination never sees the names of platform staff, as in the audit log screen. */
const PLATFORM_TEAM_LABEL = 'Equipo de plataforma';
/** audit_logs.created_at is UTC; Bogota is five hours behind all year. */
const BOGOTA_OFFSET_HOURS = Prisma.raw('5');

interface BucketRow {
  bucket: string;
  total: bigint | number;
}

@Injectable()
export class PrismaAuditActivityReader implements AuditActivityReader {
  constructor(private readonly prisma: PrismaService) {}

  countEvents(
    scope: StatsScope,
    range: DateRange,
    action?: string,
  ): Promise<number> {
    const { gte, lt } = rangeBounds(range);
    return this.prisma.auditLog.count({
      where: {
        ...this.scopeWhere(scope),
        createdAt: { gte, lt },
        ...(action ? { action } : {}),
      },
    });
  }

  async eventsPerDay(
    scope: StatsScope,
    days: readonly string[],
  ): Promise<number[]> {
    if (days.length === 0) {
      return [];
    }
    const counts = await this.countByBucket(
      scope,
      { from: days[0], to: days[days.length - 1] },
      '%Y-%m-%d',
    );
    return days.map((day) => counts.get(day) ?? 0);
  }

  async eventsPerMonth(
    scope: StatsScope,
    months: readonly string[],
    until: string,
  ): Promise<number[]> {
    if (months.length === 0) {
      return [];
    }
    const counts = await this.countByBucket(
      scope,
      { from: `${months[0]}-01`, to: until },
      '%Y-%m',
    );
    return months.map((month) => counts.get(month) ?? 0);
  }

  async recent(scope: StatsScope, limit: number): Promise<RecentAuditRow[]> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.scopeWhere(scope),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true,
        userId: true,
        denominationId: true,
        congregationId: true,
        entity: true,
        action: true,
        createdAt: true,
      },
    });
    if (rows.length === 0) {
      return [];
    }

    // Three lookups for the whole list, never one per row.
    const ids = (values: (number | null)[]) => [
      ...new Set(values.filter((value): value is number => value !== null)),
    ];
    const [users, congregations, denominations] = await Promise.all([
      this.prisma.user.findMany({
        where: { id: { in: ids(rows.map((row) => row.userId)) } },
        select: {
          id: true,
          displayName: true,
          email: true,
          roleAssignments: {
            where: { scope: 'PLATFORM', revokedAt: null },
            select: { id: true },
            take: 1,
          },
        },
      }),
      this.prisma.congregation.findMany({
        where: { id: { in: ids(rows.map((row) => row.congregationId)) } },
        select: { id: true, name: true },
      }),
      this.prisma.denomination.findMany({
        where: { id: { in: ids(rows.map((row) => row.denominationId)) } },
        select: { id: true, name: true },
      }),
    ]);
    // The platform (no denomination in the scope) sees everyone; a tenant sees platform staff as one party.
    const viewerIsPlatform = scope.denominationId === null;
    const userNames = new Map(
      users.map((user) => [
        user.id,
        !viewerIsPlatform && user.roleAssignments.length > 0
          ? PLATFORM_TEAM_LABEL
          : user.displayName?.trim() || user.email.split('@')[0],
      ]),
    );
    const congregationNames = new Map(congregations.map((c) => [c.id, c.name]));
    const denominationNames = new Map(denominations.map((d) => [d.id, d.name]));

    return rows.map((row) => ({
      id: Number(row.id),
      createdAt: row.createdAt,
      action: row.action,
      entity: row.entity,
      userName:
        (row.userId !== null && userNames.get(row.userId)) || SYSTEM_USER_NAME,
      scopeLabel:
        (row.congregationId !== null &&
          congregationNames.get(row.congregationId)) ||
        (row.denominationId !== null &&
          denominationNames.get(row.denominationId)) ||
        PLATFORM_LABEL,
    }));
  }

  /** The platform sees every row; a denomination or congregation only its own. */
  private scopeWhere(scope: StatsScope): Prisma.AuditLogWhereInput {
    return {
      ...(scope.denominationId === null
        ? {}
        : { denominationId: scope.denominationId }),
      ...(scope.congregationId === null
        ? {}
        : { congregationId: scope.congregationId }),
    };
  }

  /** Counts per Bogota day or month, grouped in the database. */
  private async countByBucket(
    scope: StatsScope,
    range: DateRange,
    format: '%Y-%m-%d' | '%Y-%m',
  ): Promise<Map<string, number>> {
    const { gte, lt } = rangeBounds(range);
    const denomination =
      scope.denominationId === null
        ? Prisma.empty
        : Prisma.sql`AND denomination_id = ${scope.denominationId}`;
    const congregation =
      scope.congregationId === null
        ? Prisma.empty
        : Prisma.sql`AND congregation_id = ${scope.congregationId}`;

    const rows = await this.prisma.$queryRaw<BucketRow[]>(Prisma.sql`
      SELECT DATE_FORMAT(DATE_SUB(created_at, INTERVAL ${BOGOTA_OFFSET_HOURS} HOUR), ${format}) AS bucket,
             COUNT(*) AS total
      FROM audit_logs
      WHERE created_at >= ${gte} AND created_at < ${lt}
        ${denomination} ${congregation}
      GROUP BY bucket`);
    return new Map(rows.map((row) => [row.bucket, Number(row.total)]));
  }
}
