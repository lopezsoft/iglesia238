import { Inject, Injectable } from '@nestjs/common';
import { BusinessRuleException } from '../../../common/errors/domain.exception.js';
import {
  fileSlug,
  formatDecimal,
  formatInteger,
  formatShortDate,
} from '../../../common/reports/report-format.js';
import { ReportIssuer } from '../../../common/reports/report-issuer.js';
import type { ReportRow } from '../../../common/reports/report-pdf.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type {
  AttendanceFilter,
  AttendanceSessionRecord,
} from './attendance.models.js';
import {
  ATTENDANCE_REPOSITORY,
  type AttendanceRepository,
} from './attendance.repository.js';
import { scopeForFilter } from './list-attendance-sessions.use-case.js';

/** A printed attendance sheet is read by people: far above this it is a spreadsheet, not a document. */
export const ATTENDANCE_REPORT_MAX_SESSIONS = 3000;

/** With more category columns than this the sheet does not fit portrait. */
const PORTRAIT_MAX_CATEGORIES = 3;

function describeRange(filter: AttendanceFilter): string {
  if (filter.from && filter.to) {
    return `Del ${formatShortDate(filter.from)} al ${formatShortDate(filter.to)}`;
  }
  if (filter.from) {
    return `Desde el ${formatShortDate(filter.from)}`;
  }
  if (filter.to) {
    return `Hasta el ${formatShortDate(filter.to)}`;
  }
  return 'Todo el historial';
}

/** Average attendance per meeting type, to read the trend of each kind of meeting apart. */
function averagesNote(
  sessions: readonly AttendanceSessionRecord[],
): string | null {
  const byType = new Map<string, { total: number; count: number }>();
  for (const session of sessions) {
    const entry = byType.get(session.meetingTypeName) ?? {
      total: 0,
      count: 0,
    };
    byType.set(session.meetingTypeName, {
      total: entry.total + session.total,
      count: entry.count + 1,
    });
  }
  if (byType.size < 2) {
    return null;
  }
  const parts = [...byType.entries()].map(
    ([name, { total, count }]) =>
      `${name}: ${formatDecimal(total / count)} (${count} ${count === 1 ? 'reunión' : 'reuniones'})`,
  );
  return `Promedio de asistencia por reunión. ${parts.join(' · ')}.`;
}

/** The attendance of the meetings that match the filter as a sheet to print: figures per category, totals and averages. */
@Injectable()
export class AttendanceReportService {
  constructor(
    @Inject(ATTENDANCE_REPOSITORY)
    private readonly repository: AttendanceRepository,
    private readonly issuer: ReportIssuer,
  ) {}

  async pdf(
    tenant: TenantContext,
    filter: AttendanceFilter,
  ): Promise<{ filename: string; content: Buffer }> {
    const scope = scopeForFilter(tenant, filter);
    // One more than the cap tells "exactly the cap" from "more than the cap".
    const [categories, meetingTypes, found] = await Promise.all([
      this.repository.listCategories(),
      this.repository.listMeetingTypes(),
      this.repository.listAll(
        scope,
        filter,
        ATTENDANCE_REPORT_MAX_SESSIONS + 1,
      ),
    ]);
    if (found.length > ATTENDANCE_REPORT_MAX_SESSIONS) {
      throw new BusinessRuleException(
        `Hay más de ${ATTENDANCE_REPORT_MAX_SESSIONS} reuniones en ese rango: es demasiado para un solo documento. Acota las fechas o descarga el CSV.`,
        'ATTENDANCE_REPORT_TOO_LARGE',
      );
    }
    // Oldest first: a sheet reads as a timeline.
    const sessions = [...found].sort((a, b) =>
      a.sessionDate === b.sessionDate
        ? a.id - b.id
        : a.sessionDate.localeCompare(b.sessionDate),
    );
    const includeCongregation = scope.congregationId === null;
    const countOf = (session: AttendanceSessionRecord, code: string) =>
      session.attendanceCounts.find((count) => count.categoryCode === code)
        ?.headcount ?? 0;

    const categoryTotals = categories.map((category) =>
      sessions.reduce(
        (sum, session) => sum + countOf(session, category.code),
        0,
      ),
    );
    const grandTotal = sessions.reduce(
      (sum, session) => sum + session.total,
      0,
    );
    const peak = sessions.reduce<AttendanceSessionRecord | null>(
      (best, session) => (best && best.total >= session.total ? best : session),
      null,
    );
    const meetingName =
      filter.meetingTypeCode === undefined
        ? 'Todas las reuniones'
        : (meetingTypes.find((type) => type.code === filter.meetingTypeCode)
            ?.name ?? 'Reunión');

    const rows = sessions.map((session): ReportRow => ({
      cells: [
        formatShortDate(session.sessionDate),
        ...(includeCongregation ? [session.congregationName] : []),
        session.meetingTypeName,
        ...categories.map((category) =>
          formatInteger(countOf(session, category.code)),
        ),
        formatInteger(session.total),
      ],
    }));
    const averages = averagesNote(sessions);

    const content = await this.issuer.pdf(scope, {
      title: 'Informe de asistencia',
      subtitle: `${meetingName} · ${describeRange(filter)}`,
      orientation:
        categories.length > PORTRAIT_MAX_CATEGORIES ? 'landscape' : 'portrait',
      summary: [
        { label: 'Reuniones', value: formatInteger(sessions.length) },
        { label: 'Asistencia total', value: formatInteger(grandTotal) },
        {
          label: 'Promedio por reunión',
          value:
            sessions.length > 0
              ? formatDecimal(grandTotal / sessions.length)
              : '0',
        },
        {
          label: peak
            ? `Máximo (${formatShortDate(peak.sessionDate)})`
            : 'Máximo',
          value: peak ? formatInteger(peak.total) : '0',
        },
      ],
      columns: [
        { header: 'Fecha', weight: 1.3 },
        ...(includeCongregation ? [{ header: 'Sede', weight: 2.2 }] : []),
        { header: 'Reunión', weight: 2.2 },
        ...categories.map((category) => ({
          header: category.name,
          weight: 1.2,
          align: 'right' as const,
        })),
        { header: 'Total', weight: 1.1, align: 'right' as const },
      ],
      rows,
      totals:
        rows.length > 0
          ? [
              '',
              ...(includeCongregation ? [''] : []),
              'Totales',
              ...categoryTotals.map(formatInteger),
              formatInteger(grandTotal),
            ]
          : undefined,
      emptyMessage: 'No hay reuniones registradas con esos filtros.',
      notes: averages ? [averages] : [],
      signatures: ['Secretario(a)', 'Pastor(a)'],
    });

    const suffix = fileSlug(filter.meetingTypeCode ?? '', 'todas');
    return { filename: `asistencia-${suffix}.pdf`, content };
  }
}
