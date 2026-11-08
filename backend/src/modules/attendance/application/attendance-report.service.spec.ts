import {
  buildReportIssuer,
  TEST_LETTERHEAD,
} from '../../../../test/support/reports.js';
import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  BusinessRuleException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  ATTENDANCE_REPORT_MAX_SESSIONS,
  AttendanceReportService,
} from './attendance-report.service.js';
import type {
  AttendanceSessionRecord,
  CatalogEntry,
} from './attendance.models.js';
import type { AttendanceRepository } from './attendance.repository.js';

const CATEGORIES: CatalogEntry[] = [
  { code: 'ADULTS', name: 'Adultos' },
  { code: 'YOUTH', name: 'Jóvenes' },
  { code: 'CHILDREN', name: 'Niños' },
];

const MEETING_TYPES: CatalogEntry[] = [
  { code: 'SUNDAY', name: 'Culto dominical' },
  { code: 'PRAYER', name: 'Oración' },
];

function session(
  id: number,
  sessionDate: string,
  counts: [number, number, number],
  overrides: Partial<AttendanceSessionRecord> = {},
): AttendanceSessionRecord {
  return {
    id,
    denominationId: 1,
    congregationId: 10,
    congregationName: 'Sede Central',
    meetingTypeCode: 'SUNDAY',
    meetingTypeName: 'Culto dominical',
    sessionDate,
    attendanceCounts: CATEGORIES.map((category, index) => ({
      categoryCode: category.code,
      headcount: counts[index],
    })),
    total: counts[0] + counts[1] + counts[2],
    recordedBy: 'Marta',
    recordedAt: '2026-11-08T12:00:00.000Z',
    ...overrides,
  };
}

const SESSIONS = [
  session(1, '2026-11-01', [60, 20, 10]),
  session(2, '2026-11-08', [80, 25, 15]),
];

const sede = buildTenantContext({ permissions: ['attendance.write'] });
const wide = buildTenantContext({
  kind: 'DENOMINATION',
  permissions: ['attendance.write'],
});

function build(
  sessions: readonly AttendanceSessionRecord[] = SESSIONS,
  categories: CatalogEntry[] = CATEGORIES,
) {
  const listAll = vi
    .fn<AttendanceRepository['listAll']>()
    .mockResolvedValue([...sessions]);
  const repository = {
    listCategories: vi.fn().mockResolvedValue(categories),
    listMeetingTypes: vi.fn().mockResolvedValue(MEETING_TYPES),
    listAll,
  } as unknown as AttendanceRepository;
  const printing = buildReportIssuer();
  return {
    service: new AttendanceReportService(repository, printing.issuer),
    listAll,
    ...printing,
  };
}

describe('AttendanceReportService', () => {
  it('asks for the sessions of the filter, with room to tell when there are too many', async () => {
    const { service, listAll } = build();

    await service.pdf(sede, { meetingTypeCode: 'SUNDAY', from: '2026-11-01' });

    const [scope, filter, limit] = listAll.mock.calls[0];
    expect(scope.congregationId).toBe(10);
    expect(filter).toEqual({ meetingTypeCode: 'SUNDAY', from: '2026-11-01' });
    expect(limit).toBe(ATTENDANCE_REPORT_MAX_SESSIONS + 1);
  });

  it('prints the sheet on the letterhead of the sede, with a column per category', async () => {
    const { service, sent } = build();

    const file = await service.pdf(sede, {});

    expect(sent().title).toBe('Informe de asistencia');
    expect(sent().letterhead).toEqual(TEST_LETTERHEAD);
    expect(sent().columns.map((column) => column.header)).toEqual([
      'Fecha',
      'Reunión',
      'Adultos',
      'Jóvenes',
      'Niños',
      'Total',
    ]);
    expect(sent().orientation).toBe('portrait');
    expect(file.filename).toBe('asistencia-todas.pdf');
  });

  it('puts the oldest meeting first, whatever order the repository answers in', async () => {
    const { service, sent } = build([...SESSIONS].reverse());

    await service.pdf(sede, {});

    expect(sent().rows.map((row) => row.cells[0])).toEqual([
      '01/11/2026',
      '08/11/2026',
    ]);
  });

  it('prints the headcount of each category and the total of each meeting', async () => {
    const { service, sent } = build();

    await service.pdf(sede, {});

    expect(sent().rows[0].cells).toEqual([
      '01/11/2026',
      'Culto dominical',
      '60',
      '20',
      '10',
      '90',
    ]);
    for (const row of sent().rows) {
      expect(row.cells).toHaveLength(sent().columns.length);
    }
  });

  it('adds up each category and the whole in the last row', async () => {
    const { service, sent } = build();

    await service.pdf(sede, {});

    expect(sent().totals).toEqual(['', 'Totales', '140', '45', '25', '210']);
  });

  it('summarises the meetings, the total, the average and the best day', async () => {
    const { service, sent } = build();

    await service.pdf(sede, {});

    expect(sent().summary).toEqual([
      { label: 'Reuniones', value: '2' },
      { label: 'Asistencia total', value: '210' },
      { label: 'Promedio por reunión', value: '105' },
      { label: 'Máximo (08/11/2026)', value: '120' },
    ]);
  });

  it('reads a zero where a category has no count, instead of leaving a hole', async () => {
    const { service, sent } = build([
      session(1, '2026-11-01', [10, 0, 0], { attendanceCounts: [] }),
    ]);

    await service.pdf(sede, {});

    expect(sent().rows[0].cells.slice(2, 5)).toEqual(['0', '0', '0']);
  });

  it('gives the average of each kind of meeting when the sheet mixes several', async () => {
    const { service, sent } = build([
      ...SESSIONS,
      session(3, '2026-11-04', [20, 5, 5], {
        meetingTypeCode: 'PRAYER',
        meetingTypeName: 'Oración',
      }),
    ]);

    await service.pdf(sede, {});

    expect(sent().notes).toEqual([
      'Promedio de asistencia por reunión. Culto dominical: 105 (2 reuniones) · Oración: 30 (1 reunión).',
    ]);
  });

  it('gives no per-type averages when there is a single kind of meeting', async () => {
    const { service, sent } = build();

    await service.pdf(sede, {});

    expect(sent().notes).toEqual([]);
  });

  it('adds the sede column and a neutral letterhead for a denomination-wide session', async () => {
    const { service, sent, find } = build();

    await service.pdf(wide, {});

    expect(sent().columns.map((column) => column.header)).toContain('Sede');
    expect(sent().rows[0].cells).toContain('Sede Central');
    expect(sent().totals).toHaveLength(sent().columns.length);
    expect(find.mock.calls[0][0].congregationId).toBeNull();
  });

  it('prints the letterhead of the sede a denomination-wide session picked', async () => {
    const { service, find, sent } = build();

    await service.pdf(wide, { congregationId: 11 });

    expect(find.mock.calls[0][0].congregationId).toBe(11);
    expect(sent().columns.map((column) => column.header)).not.toContain('Sede');
  });

  it('turns the sheet to landscape when there are many categories', async () => {
    const many: CatalogEntry[] = [
      ...CATEGORIES,
      { code: 'VISITORS', name: 'Visitantes' },
    ];
    const { service, sent } = build(SESSIONS, many);

    await service.pdf(sede, {});

    expect(sent().orientation).toBe('landscape');
  });

  it.each([
    [{}, 'Todas las reuniones · Todo el historial'],
    [
      { meetingTypeCode: 'SUNDAY', from: '2026-11-01', to: '2026-11-30' },
      'Culto dominical · Del 01/11/2026 al 30/11/2026',
    ],
    [{ from: '2026-11-01' }, 'Todas las reuniones · Desde el 01/11/2026'],
    [{ to: '2026-11-30' }, 'Todas las reuniones · Hasta el 30/11/2026'],
  ])('describes the filter %j in the subtitle', async (filter, expected) => {
    const { service, sent } = build();

    await service.pdf(sede, filter);

    expect(sent().subtitle).toBe(expected);
  });

  it('names the file after the meeting type', async () => {
    const { service } = build();

    const file = await service.pdf(sede, { meetingTypeCode: 'SUNDAY' });

    expect(file.filename).toBe('asistencia-sunday.pdf');
  });

  it('prints an empty sheet with an explanation when there are no meetings', async () => {
    const { service, sent } = build([]);

    await service.pdf(sede, {});

    expect(sent().rows).toEqual([]);
    expect(sent().totals).toBeUndefined();
    expect(sent().emptyMessage).toContain('No hay reuniones');
    expect(sent().summary?.[2].value).toBe('0');
  });

  it('refuses more meetings than a document can hold, and prints nothing', async () => {
    const tooMany = Array.from(
      { length: ATTENDANCE_REPORT_MAX_SESSIONS + 1 },
      (_, index) => session(index + 1, '2026-11-01', [1, 1, 1]),
    );
    const { service, render } = build(tooMany);

    const failure = await service.pdf(sede, {}).catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(BusinessRuleException);
    expect((failure as { code: string }).code).toBe(
      'ATTENDANCE_REPORT_TOO_LARGE',
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('answers 404 when the user asks for a sede outside their scope', async () => {
    const { service, render } = build();

    await expect(
      service.pdf(sede, { congregationId: 11 }),
    ).rejects.toBeInstanceOf(NotFoundDomainException);
    expect(render).not.toHaveBeenCalled();
  });

  it('rejects dates that are not dates, or a range that runs backwards', async () => {
    const { service } = build();

    await expect(service.pdf(sede, { from: 'ayer' })).rejects.toBeInstanceOf(
      InvalidInputException,
    );
    await expect(
      service.pdf(sede, { from: '2026-11-30', to: '2026-11-01' }),
    ).rejects.toBeInstanceOf(InvalidInputException);
  });
});
