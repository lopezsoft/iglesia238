import { buildTenantContext } from '../../../../test/support/tenants.js';
import {
  buildReportIssuer,
  TEST_LETTERHEAD,
} from '../../../../test/support/reports.js';
import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import {
  formatMoney,
  formatPercent,
} from '../../../common/reports/report-format.js';
import type { GetTitheSettlementUseCase } from './list-tithe-settlements.use-case.js';
import { TitheSettlementReportService } from './tithe-settlement-report.service.js';
import type { TitheSettlementDetail } from './tithe-settlement.models.js';

const DETAIL: TitheSettlementDetail = {
  id: 5,
  number: 'LD-2026-00005',
  coveredFrom: '2026-11-01',
  coveredTo: '2026-11-07',
  settledOn: '2026-11-08',
  grossTithe: 1_000_000,
  nationalShare: 100_000,
  localFundShare: 200_000,
  pastorNet: 700_000,
  nationalShareRate: 0.1,
  localFundRate: 0.2,
  contributionCount: 2,
  status: 'ISSUED',
  voidReason: null,
  voidedAt: null,
  congregationName: 'Sede Central',
  voidedByName: null,
  contributions: [
    {
      id: 1,
      receiptNumber: 'REC-2026-00031',
      receivedOn: '2026-11-02',
      contributorName: 'Ana Pérez',
      memberCode: 'M-0001',
      paymentMethod: 'CASH',
      amount: 600_000,
    },
    {
      id: 2,
      receiptNumber: null,
      receivedOn: '2026-11-05',
      contributorName: null,
      memberCode: null,
      paymentMethod: 'BANK_TRANSFER',
      amount: 400_000,
    },
  ],
  cashLines: [
    {
      id: 1,
      postedOn: '2026-11-08',
      direction: 'OUT',
      amount: 100_000,
      description: 'Cuota nacional LD-2026-00005',
      accountCode: '520505',
      accountName: 'Cuota nacional',
      fundName: 'Fondo General',
      isReversal: false,
    },
    {
      id: 2,
      postedOn: '2026-11-08',
      direction: 'OUT',
      amount: 700_000,
      description: 'Neto del pastor LD-2026-00005',
      accountCode: '510506',
      accountName: 'Honorarios pastorales',
      fundName: 'Fondo General',
      isReversal: false,
    },
  ],
};

const treasurer = buildTenantContext({
  permissions: ['tithe-settlements.write'],
});

function build(
  detail: TitheSettlementDetail | Error = DETAIL,
  options: Parameters<typeof buildReportIssuer>[0] = {},
) {
  const execute = vi.fn();
  if (detail instanceof Error) {
    execute.mockRejectedValue(detail);
  } else {
    execute.mockResolvedValue(detail);
  }
  const printing = buildReportIssuer(options);
  const service = new TitheSettlementReportService(
    { execute } as unknown as GetTitheSettlementUseCase,
    printing.issuer,
  );
  return { service, execute, ...printing };
}

describe('TitheSettlementReportService', () => {
  it('reads the settlement of the sede of the user and prints it on that sede letterhead', async () => {
    const { service, execute, find, sent } = build();

    await service.pdf(treasurer, 5);

    expect(execute).toHaveBeenCalledWith(treasurer, 5);
    expect(find.mock.calls[0][0].congregationId).toBe(10);
    expect(sent().letterhead).toEqual(TEST_LETTERHEAD);
    expect(sent().generatedOn).toBe('2026-11-08');
  });

  it('is a portrait act titled with the number and the period it covers', async () => {
    const { service, sent } = build();

    const file = await service.pdf(treasurer, 5);

    expect(sent().title).toBe('Acta de liquidación de diezmos');
    expect(sent().subtitle).toBe(
      'LD-2026-00005 · Del 01/11/2026 al 07/11/2026',
    );
    expect(sent().orientation).toBe('portrait');
    expect(file.filename).toBe('acta-liquidacion-ld-2026-00005.pdf');
    expect(file.content.equals(Buffer.from('%PDF-fake'))).toBe(true);
  });

  it('shows how the gross was split, with the percentage copied when it was issued', async () => {
    const { service, sent } = build();

    await service.pdf(treasurer, 5);

    expect(sent().summary).toEqual([
      { label: 'Diezmo bruto', value: formatMoney(1_000_000) },
      {
        label: `Cuota nacional (${formatPercent(0.1)})`,
        value: formatMoney(100_000),
      },
      {
        label: `Fondo local (${formatPercent(0.2)})`,
        value: formatMoney(200_000),
      },
      {
        label: `Neto del pastor (${formatPercent(0.7)})`,
        value: formatMoney(700_000),
      },
    ]);
  });

  it('does not print 70 % as 70.00000000000001 when the rates are awkward fractions', async () => {
    const { service, sent } = build({
      ...DETAIL,
      nationalShareRate: 0.15,
      localFundRate: 0.15,
    });

    await service.pdf(treasurer, 5);

    expect(sent().summary?.[3].label).toBe(
      `Neto del pastor (${formatPercent(0.7)})`,
    );
  });

  it('lists each tithe with its receipt, contributor, code and payment method, and adds them up', async () => {
    const { service, sent } = build();

    await service.pdf(treasurer, 5);

    expect(sent().rows).toEqual([
      {
        cells: [
          'REC-2026-00031',
          '02/11/2026',
          'Ana Pérez',
          'M-0001',
          'Efectivo',
          formatMoney(600_000),
        ],
      },
      {
        cells: [
          '—',
          '05/11/2026',
          'Anónimo',
          '—',
          'Transferencia',
          formatMoney(400_000),
        ],
      },
    ]);
    expect(sent().totals).toEqual([
      '',
      '',
      '',
      '',
      'Total (2)',
      formatMoney(1_000_000),
    ]);
    for (const row of sent().rows) {
      expect(row.cells).toHaveLength(sent().columns.length);
    }
  });

  it('says when it was issued and where each cash movement was booked', async () => {
    const { service, sent } = build();

    await service.pdf(treasurer, 5);

    const notes = sent().notes ?? [];
    expect(notes[0]).toContain('8 de noviembre de 2026');
    expect(notes[0]).toContain('Sede Central');
    expect(notes[1]).toContain('Egreso de caja');
    expect(notes[1]).toContain('520505 · Cuota nacional, fondo Fondo General');
    expect(notes[2]).toContain('510506 · Honorarios pastorales');
    expect(notes).toHaveLength(3);
  });

  it('has the signature lines of the treasury, the pastor and the auditor', async () => {
    const { service, sent } = build();

    await service.pdf(treasurer, 5);

    expect(sent().signatures).toEqual([
      'Tesorero(a)',
      'Pastor(a)',
      'Fiscal / Revisor',
    ]);
  });

  describe('a voided settlement', () => {
    const voided: TitheSettlementDetail = {
      ...DETAIL,
      status: 'VOIDED',
      contributionCount: 0,
      contributions: [],
      voidReason: 'Se contó dos veces un diezmo',
      // 22:30 in Bogotá on the 8th is already the 9th in UTC.
      voidedAt: '2026-11-09T03:30:00.000Z',
      voidedByName: 'Marta Gómez',
      cashLines: [
        { ...DETAIL.cashLines[0], isReversal: true, direction: 'IN' },
      ],
    };

    it('still prints, marked as voided in the subtitle', async () => {
      const { service, sent } = build(voided);

      await service.pdf(treasurer, 5);

      expect(sent().subtitle).toBe(
        'LD-2026-00005 · Del 01/11/2026 al 07/11/2026 · ANULADA',
      );
    });

    it('explains that its tithes were released instead of printing an empty table', async () => {
      const { service, sent } = build(voided);

      await service.pdf(treasurer, 5);

      expect(sent().rows).toEqual([]);
      expect(sent().totals).toBeUndefined();
      expect(sent().emptyMessage).toContain('liberados');
    });

    it('says who voided it, when (in Bogotá time) and why, and marks the reversed cash line', async () => {
      const { service, sent } = build(voided);

      await service.pdf(treasurer, 5);

      const notes = sent().notes ?? [];
      expect(notes.at(-1)).toBe(
        'ANULADA el 08/11/2026 por Marta Gómez. Motivo: Se contó dos veces un diezmo.',
      );
      expect(notes[1]).toContain('Ingreso de caja (reversa por anulación)');
    });
  });

  it('answers 404, and prints nothing, when the settlement does not belong to the sede', async () => {
    const { service, render } = build(
      new NotFoundDomainException('La liquidación no existe en la sede.'),
    );

    await expect(service.pdf(treasurer, 99)).rejects.toBeInstanceOf(
      NotFoundDomainException,
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('asks a denomination-wide session to pick a sede first', async () => {
    const { service, render } = build();
    const wide = buildTenantContext({
      kind: 'DENOMINATION',
      permissions: ['tithe-settlements.write'],
    });

    await expect(service.pdf(wide, 5)).rejects.toBeInstanceOf(
      InvalidInputException,
    );
    expect(render).not.toHaveBeenCalled();
  });

  it('dresses the act with the logo and color of the denomination', async () => {
    const logo = Buffer.from('logo');
    const { service, sent } = build(DETAIL, {
      branding: { accentColor: '#8b0000', logo },
    });

    await service.pdf(treasurer, 5);

    expect(sent().accentColor).toBe('#8b0000');
    expect(sent().logo).toBe(logo);
  });
});
