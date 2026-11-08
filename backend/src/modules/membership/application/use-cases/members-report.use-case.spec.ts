import {
  buildReportIssuer,
  TEST_LETTERHEAD,
} from '../../../../../test/support/reports.js';
import {
  TENANT_A,
  TENANT_A_WIDE,
} from '../../../../../test/support/tenants.js';
import { BusinessRuleException } from '../../../../common/errors/domain.exception.js';
import type { AuditRecorder } from '../../../../common/audit/audit-recorder.port.js';
import type { CommandContext } from '../command-context.js';
import type { MemberListRow } from '../member.models.js';
import type { MemberRepository } from '../ports/member.repository.js';
import type { MemberFiltersInput } from './list-members.use-case.js';
import {
  MEMBERS_REPORT_MAX_ROWS,
  MembersReportUseCase,
} from './members-report.use-case.js';

const NO_FILTERS: MemberFiltersInput = {
  text: '',
  status: 'ALL',
  sex: 'ALL',
  ageRange: 'ALL',
  position: 'ALL',
  congregationId: null,
};

function member(overrides: Partial<MemberListRow> = {}): MemberListRow {
  return {
    id: 1,
    code: 'M-0001',
    fullName: 'Ana María Pérez',
    sex: 'FEMALE',
    documentTypeCode: 'CC',
    documentNumber: '52123456',
    birthDate: '1990-05-10',
    phone: '3001234567',
    joinedOn: '2015-03-01',
    status: 'ACTIVE',
    congregationId: 10,
    congregationName: 'Sede Central',
    positions: ['Diácono', 'Tesorero'],
    ...overrides,
  };
}

function build(
  rows: readonly MemberListRow[],
  options: { wide?: boolean } = {},
) {
  const listForExport = vi
    .fn<MemberRepository['listForExport']>()
    .mockResolvedValue([...rows]);
  const record = vi.fn<AuditRecorder['record']>().mockResolvedValue(undefined);
  const printing = buildReportIssuer();
  const useCase = new MembersReportUseCase(
    { listForExport } as unknown as MemberRepository,
    { record },
    printing.issuer,
    { today: () => '2026-11-08' } as never,
  );
  const context: CommandContext = {
    scope: options.wide ? TENANT_A_WIDE : TENANT_A,
    actor: {
      userId: 7,
      denominationId: 1,
      congregationId: options.wide ? null : 10,
    },
    ipAddress: '10.0.0.1',
  };
  return { useCase, context, listForExport, record, ...printing };
}

describe('MembersReportUseCase', () => {
  it('asks for the same list as the screen, with the same filters, up to the cap of a document', async () => {
    const { useCase, context, listForExport } = build([member()]);

    await useCase.execute(context, {
      ...NO_FILTERS,
      status: 'ACTIVE',
      text: ' ana ',
    });

    const [scope, criteria, limit] = listForExport.mock.calls[0];
    expect(scope).toBe(TENANT_A);
    expect(criteria).toMatchObject({
      status: 'ACTIVE',
      text: 'ana',
      congregationId: 10,
    });
    expect(limit).toBe(MEMBERS_REPORT_MAX_ROWS + 1);
  });

  it('prints a landscape directory with the letterhead of the sede', async () => {
    const { useCase, context, sent } = build([member()]);

    const file = await useCase.execute(context, NO_FILTERS);

    expect(sent().title).toBe('Directorio de miembros');
    expect(sent().subtitle).toBe('Todos los miembros');
    expect(sent().orientation).toBe('landscape');
    expect(sent().letterhead).toEqual(TEST_LETTERHEAD);
    expect(file.filename).toBe('directorio-miembros-2026-11-08.pdf');
    expect(file.rows).toBe(1);
  });

  it('lists each member with document, age, phone, joining date, positions and status', async () => {
    const { useCase, context, sent } = build([member()]);

    await useCase.execute(context, NO_FILTERS);

    expect(sent().columns.map((column) => column.header)).toEqual([
      'Carné',
      'Nombre',
      'Documento',
      'Edad',
      'Teléfono',
      'Ingreso',
      'Cargo',
      'Estado',
    ]);
    expect(sent().rows).toEqual([
      {
        cells: [
          'M-0001',
          'Ana María Pérez',
          'CC 52123456',
          '36',
          '3001234567',
          '01/03/2015',
          'Diácono, Tesorero',
          'Activo',
        ],
        style: 'normal',
      },
    ]);
  });

  it('leaves blank what the member has not given, instead of printing "null" or "undefined"', async () => {
    const { useCase, context, sent } = build([
      member({
        documentTypeCode: null,
        documentNumber: null,
        birthDate: null,
        phone: null,
        joinedOn: null,
        positions: [],
      }),
    ]);

    await useCase.execute(context, NO_FILTERS);

    expect(sent().rows[0].cells).toEqual([
      'M-0001',
      'Ana María Pérez',
      '',
      '',
      '',
      '',
      '',
      'Activo',
    ]);
  });

  it('adds the sede column when the session covers the whole denomination', async () => {
    const { useCase, context, sent, find } = build([member()], { wide: true });

    await useCase.execute(context, NO_FILTERS);

    expect(sent().columns.map((column) => column.header)).toContain('Sede');
    expect(sent().rows[0].cells).toContain('Sede Central');
    for (const row of sent().rows) {
      expect(row.cells).toHaveLength(sent().columns.length);
    }
    expect(find.mock.calls[0][0].congregationId).toBeNull();
  });

  it('prints the letterhead of the sede when a denomination-wide session narrowed the list to one', async () => {
    const { useCase, context, find } = build([member()], { wide: true });

    await useCase.execute(context, { ...NO_FILTERS, congregationId: 11 });

    expect(find.mock.calls[0][0].congregationId).toBe(11);
  });

  it('greys out the members who are not active and says so', async () => {
    const { useCase, context, sent } = build([
      member(),
      member({ id: 2, code: 'M-0002', status: 'TRANSFERRED' }),
    ]);

    await useCase.execute(context, NO_FILTERS);

    expect(sent().rows.map((row) => row.style)).toEqual(['normal', 'muted']);
    expect(sent().notes?.[0]).toContain('en gris');
  });

  it('counts the members by status for the strip above the table', async () => {
    const { useCase, context, sent } = build([
      member(),
      member({ id: 2, status: 'ACTIVE' }),
      member({ id: 3, status: 'INACTIVE' }),
      member({ id: 4, status: 'TRANSFERRED' }),
      member({ id: 5, status: 'DECEASED' }),
    ]);

    await useCase.execute(context, NO_FILTERS);

    expect(sent().summary).toEqual([
      { label: 'Miembros en el listado', value: '5' },
      { label: 'Activos', value: '2' },
      { label: 'Inactivos', value: '1' },
      { label: 'Trasladados o fallecidos', value: '2' },
    ]);
  });

  it('says in the subtitle which filters were applied', async () => {
    const { useCase, context, sent } = build([member()]);

    await useCase.execute(context, {
      ...NO_FILTERS,
      status: 'ACTIVE',
      sex: 'FEMALE',
      ageRange: 'ADULTS',
      position: 'NONE',
      text: 'ana',
    });

    expect(sent().subtitle).toBe(
      'Estado: Activo · Sexo: Mujeres · Edad: Adultos (30 a 59) · Sin cargo · Búsqueda: «ana»',
    );
  });

  it('warns that it holds personal data', async () => {
    const { useCase, context, sent } = build([member()]);

    await useCase.execute(context, NO_FILTERS);

    expect(sent().notes?.join(' ')).toContain('datos personales');
  });

  it('records in the audit log that a directory was printed, with how many rows and not who', async () => {
    const { useCase, context, record } = build([member(), member({ id: 2 })]);

    await useCase.execute(context, NO_FILTERS);

    expect(record).toHaveBeenCalledTimes(1);
    const entry = record.mock.calls[0][0];
    expect(entry).toMatchObject({
      action: 'MEMBERS_REPORT_PRINTED',
      entity: 'Member',
      changes: { rows: { from: null, to: 2 } },
      ipAddress: '10.0.0.1',
    });
    expect(JSON.stringify(entry)).not.toContain('Ana');
    expect(JSON.stringify(entry)).not.toContain('52123456');
  });

  it('accepts a list of exactly the cap', async () => {
    const rows = Array.from({ length: MEMBERS_REPORT_MAX_ROWS }, (_, index) =>
      member({ id: index + 1, code: `M-${index + 1}` }),
    );
    const { useCase, context } = build(rows);

    await expect(useCase.execute(context, NO_FILTERS)).resolves.toMatchObject({
      rows: MEMBERS_REPORT_MAX_ROWS,
    });
  });

  it('refuses a list above the cap, tells how to get it, and neither prints nor audits', async () => {
    const rows = Array.from(
      { length: MEMBERS_REPORT_MAX_ROWS + 1 },
      (_, index) => member({ id: index + 1 }),
    );
    const { useCase, context, render, record } = build(rows);

    const failure = await useCase
      .execute(context, NO_FILTERS)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(BusinessRuleException);
    expect((failure as { code: string }).code).toBe('MEMBERS_REPORT_TOO_LARGE');
    expect((failure as Error).message).toContain('CSV');
    expect(render).not.toHaveBeenCalled();
    expect(record).not.toHaveBeenCalled();
  });

  it('prints an empty directory with an explanation when no member matches, and still audits it', async () => {
    const { useCase, context, sent, record } = build([]);

    await useCase.execute(context, { ...NO_FILTERS, text: 'zzz' });

    expect(sent().rows).toEqual([]);
    expect(sent().emptyMessage).toContain('Ningún miembro');
    expect(record).toHaveBeenCalledTimes(1);
  });

  it('does not audit a print that failed to render', async () => {
    const { useCase, context, render, record } = build([member()]);
    render.mockRejectedValue(new Error('pdf engine down'));

    await expect(useCase.execute(context, NO_FILTERS)).rejects.toThrow(
      'pdf engine down',
    );
    expect(record).not.toHaveBeenCalled();
  });
});
