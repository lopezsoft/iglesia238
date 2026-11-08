import { Inject, Injectable } from '@nestjs/common';
import { AUDIT_RECORDER } from '../../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import { BusinessRuleException } from '../../../../common/errors/domain.exception.js';
import { formatShortDate } from '../../../../common/reports/report-format.js';
import { ReportIssuer } from '../../../../common/reports/report-issuer.js';
import type { ReportRow } from '../../../../common/reports/report-pdf.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import type { CommandContext } from '../command-context.js';
import { MEMBER_STATUS_LABELS } from '../members-csv.js';
import { ageOn } from '../member-rules.js';
import type { AgeRange, MemberListRow, Sex } from '../member.models.js';
import { MEMBER_REPOSITORY } from '../ports/member.repository.js';
import type { MemberRepository } from '../ports/member.repository.js';
import {
  toCriteria,
  type MemberFiltersInput,
} from './list-members.use-case.js';

/** A printed directory is for reading and filing: far above this it is a spreadsheet, not a document. */
export const MEMBERS_REPORT_MAX_ROWS = 5000;

const SEX_LABELS: Readonly<Record<Sex, string>> = {
  FEMALE: 'Mujeres',
  MALE: 'Hombres',
};

const AGE_RANGE_LABELS: Readonly<Record<AgeRange, string>> = {
  ALL: 'Todas las edades',
  CHILDREN: 'Niños (0 a 11)',
  TEENAGERS: 'Adolescentes (12 a 17)',
  YOUNG_ADULTS: 'Jóvenes (18 a 29)',
  ADULTS: 'Adultos (30 a 59)',
  SENIORS: 'Mayores (60 o más)',
};

/** What the filters of the list say, in the words of the subtitle: "Estado: Activo · Edad: Adultos (30 a 59)". */
function describeFilters(filters: MemberFiltersInput): string {
  const parts: string[] = [];
  if (filters.status !== 'ALL') {
    parts.push(`Estado: ${MEMBER_STATUS_LABELS[filters.status]}`);
  }
  if (filters.sex !== 'ALL') {
    parts.push(`Sexo: ${SEX_LABELS[filters.sex]}`);
  }
  if (filters.ageRange !== 'ALL') {
    parts.push(`Edad: ${AGE_RANGE_LABELS[filters.ageRange]}`);
  }
  if (filters.position === 'NONE') {
    parts.push('Sin cargo');
  } else if (filters.position !== 'ALL') {
    parts.push('Con el cargo elegido');
  }
  const text = filters.text.trim();
  if (text) {
    parts.push(`Búsqueda: «${text}»`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'Todos los miembros';
}

function documentLabel(row: MemberListRow): string {
  if (!row.documentNumber) {
    return '';
  }
  return row.documentTypeCode
    ? `${row.documentTypeCode} ${row.documentNumber}`
    : row.documentNumber;
}

export interface MembersReportFile {
  readonly filename: string;
  readonly content: Buffer;
  readonly rows: number;
}

/**
 * The member list, filtered like the screen, as a printable directory. It carries the same personal data as the CSV, so it
 * needs the same permissions and leaves the same trace in the audit log: how many rows left, never who they were.
 */
@Injectable()
export class MembersReportUseCase {
  constructor(
    @Inject(MEMBER_REPOSITORY) private readonly members: MemberRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly issuer: ReportIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(
    context: CommandContext,
    filters: MemberFiltersInput,
  ): Promise<MembersReportFile> {
    const today = this.clock.today();
    // One more than the cap tells "exactly the cap" from "more than the cap" without counting twice.
    const rows = await this.members.listForExport(
      context.scope,
      toCriteria(context.scope, filters, today),
      MEMBERS_REPORT_MAX_ROWS + 1,
    );
    if (rows.length > MEMBERS_REPORT_MAX_ROWS) {
      throw new BusinessRuleException(
        `El listado tiene más de ${MEMBERS_REPORT_MAX_ROWS} miembros: es demasiado grande para un solo documento. Filtra por estado, sede o edad, o descarga el CSV.`,
        'MEMBERS_REPORT_TOO_LARGE',
      );
    }
    const includeCongregation = context.scope.congregationId === null;
    // A denomination-wide session that narrowed the list to one sede prints that sede's letterhead.
    const letterheadScope =
      context.scope.congregationId === null && filters.congregationId !== null
        ? context.scope.forCongregation(filters.congregationId)
        : context.scope;

    const count = (status: MemberListRow['status']) =>
      rows.filter((row) => row.status === status).length;
    const content = await this.issuer.pdf(letterheadScope, {
      title: 'Directorio de miembros',
      subtitle: describeFilters(filters),
      orientation: 'landscape',
      summary: [
        { label: 'Miembros en el listado', value: String(rows.length) },
        { label: 'Activos', value: String(count('ACTIVE')) },
        { label: 'Inactivos', value: String(count('INACTIVE')) },
        {
          label: 'Trasladados o fallecidos',
          value: String(count('TRANSFERRED') + count('DECEASED')),
        },
      ],
      columns: [
        { header: 'Carné', weight: 1.1 },
        { header: 'Nombre', weight: 3.2 },
        { header: 'Documento', weight: 1.8 },
        { header: 'Edad', weight: 0.7, align: 'right' },
        { header: 'Teléfono', weight: 1.4 },
        { header: 'Ingreso', weight: 1.2 },
        ...(includeCongregation ? [{ header: 'Sede', weight: 2 }] : []),
        { header: 'Cargo', weight: 2 },
        { header: 'Estado', weight: 1.2 },
      ],
      rows: rows.map((row): ReportRow => ({
        cells: [
          row.code,
          row.fullName,
          documentLabel(row),
          String(ageOn(row.birthDate, today) ?? ''),
          row.phone ?? '',
          row.joinedOn ? formatShortDate(row.joinedOn) : '',
          ...(includeCongregation ? [row.congregationName] : []),
          row.positions.join(', '),
          MEMBER_STATUS_LABELS[row.status],
        ],
        style: row.status === 'ACTIVE' ? 'normal' : 'muted',
      })),
      emptyMessage: 'Ningún miembro coincide con los filtros.',
      notes: [
        ...(rows.some((row) => row.status !== 'ACTIVE')
          ? ['Las líneas en gris son miembros que no están activos.']
          : []),
        'Este documento contiene datos personales de los miembros. Úselo solo para la gestión de la iglesia y no lo comparta (Ley 1581 de 2012).',
      ],
    });

    await this.audit.record({
      action: 'MEMBERS_REPORT_PRINTED',
      entity: 'Member',
      entityId: '*',
      actor: context.actor,
      changes: { rows: { from: null, to: rows.length } },
      ipAddress: context.ipAddress,
    });
    return {
      filename: `directorio-miembros-${today}.pdf`,
      content,
      rows: rows.length,
    };
  }
}
