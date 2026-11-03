import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../infrastructure/prisma/prisma.service.js';
import type { DateRange } from '../application/dashboard.types.js';
import type {
  DashboardOperationsReader,
  LatestAttendance,
  MemberCounts,
} from '../application/ports/dashboard-operations.reader.js';
import type { StatsScope } from '../application/ports/dashboard-stats.reader.js';

/** A DATE column filter for an inclusive range of Bogota calendar days. */
function dateRange(range: DateRange) {
  return {
    gte: new Date(`${range.from}T00:00:00.000Z`),
    lte: new Date(`${range.to}T00:00:00.000Z`),
  };
}

/** Rows of the tenant: the congregation when the scope has one, else the whole denomination. */
function tenantWhere(scope: StatsScope) {
  if (scope.denominationId === null) {
    throw new Error('Operational counts need a denomination.');
  }
  return {
    denominationId: scope.denominationId,
    ...(scope.congregationId === null
      ? {}
      : { congregationId: scope.congregationId }),
  };
}

@Injectable()
export class PrismaDashboardOperationsReader implements DashboardOperationsReader {
  constructor(private readonly prisma: PrismaService) {}

  async countMembers(
    scope: StatsScope,
    range: DateRange,
    previous: DateRange,
  ): Promise<MemberCounts> {
    const where = { ...tenantWhere(scope), deletedAt: null };
    const [active, joinedInRange, joinedInPrevious] = await Promise.all([
      this.prisma.member.count({ where: { ...where, status: 'ACTIVE' } }),
      this.prisma.member.count({
        where: { ...where, joinedOn: dateRange(range) },
      }),
      this.prisma.member.count({
        where: { ...where, joinedOn: dateRange(previous) },
      }),
    ]);
    return { active, joinedInRange, joinedInPrevious };
  }

  countOpenApplications(scope: StatsScope): Promise<number> {
    return this.prisma.membershipApplication.count({
      where: {
        ...tenantWhere(scope),
        status: { in: ['PENDING', 'IN_REVIEW'] },
      },
    });
  }

  countCertificatesIssued(
    scope: StatsScope,
    range: DateRange,
  ): Promise<number> {
    return this.prisma.certificate.count({
      where: {
        ...tenantWhere(scope),
        voidedAt: null,
        issuedOn: dateRange(range),
      },
    });
  }

  countCardsExpiring(
    scope: StatsScope,
    today: string,
    until: string,
  ): Promise<number> {
    return this.prisma.membershipCard.count({
      where: {
        ...tenantWhere(scope),
        voidedAt: null,
        expiresOn: dateRange({ from: today, to: until }),
      },
    });
  }

  countAttendanceSessions(
    scope: StatsScope,
    range: DateRange,
  ): Promise<number> {
    return this.prisma.attendanceSession.count({
      where: { ...tenantWhere(scope), sessionDate: dateRange(range) },
    });
  }

  async latestAttendance(scope: StatsScope): Promise<LatestAttendance | null> {
    const session = await this.prisma.attendanceSession.findFirst({
      where: tenantWhere(scope),
      orderBy: [{ sessionDate: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        sessionDate: true,
        meetingType: { select: { name: true } },
      },
    });
    if (!session) {
      return null;
    }
    const total = await this.prisma.attendanceCount.aggregate({
      where: { sessionId: session.id },
      _sum: { headcount: true },
    });
    return {
      sessionDate: session.sessionDate.toISOString().slice(0, 10),
      meetingTypeName: session.meetingType.name,
      headcount: total._sum.headcount ?? 0,
    };
  }
}
