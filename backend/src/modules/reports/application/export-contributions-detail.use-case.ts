import { Inject, Injectable } from '@nestjs/common';
import { buildAuditChanges } from '../../../common/audit/audit-changes.js';
import { AUDIT_RECORDER } from '../../../common/audit/audit-recorder.port.js';
import type { AuditRecorder } from '../../../common/audit/audit-recorder.port.js';
import {
  BusinessRuleException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { csvDate, toCsvDocument } from '../../../common/export/csv-document.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import {
  FINANCIAL_DATA_READER,
  type FinancialDataReader,
} from './ports/financial-data.reader.js';
import type {
  ContributionDetailStatus,
  PaymentMethodValue,
  ReportQuery,
} from './report.models.js';
import { assertReportRange } from './report-range.js';
import { ReportScopeResolver } from './report-scope.resolver.js';

/** Largest export in one file; beyond it the range must be narrowed. */
export const MAX_EXPORT_ROWS = 50_000;

const ANONYMOUS = 'Anónimo o colecta';

const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethodValue, string>> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Datáfono',
  BANK_DEPOSIT: 'Consignación',
  OTHER: 'Otro',
};

const STATUS_LABELS: Readonly<Record<ContributionDetailStatus, string>> = {
  RECORDED: 'Registrado',
  SETTLED: 'Liquidado',
  VOIDED: 'Anulado',
};

const HEADERS = [
  'Fecha',
  'Recibo',
  'Sede',
  'Tipo de aporte',
  'Aportante',
  'Medio de pago',
  'Referencia',
  'Fondo',
  'Valor',
  'Estado',
] as const;

export interface ContributionExport {
  readonly fileName: string;
  readonly content: string;
  readonly rows: number;
}

/**
 * Contribution by contribution, for the treasury. It carries the name of the contributor, so the
 * route needs reports.read AND contributions.write, and every export is written to the audit log.
 */
@Injectable()
export class ExportContributionsDetailUseCase {
  constructor(
    private readonly scopes: ReportScopeResolver,
    @Inject(FINANCIAL_DATA_READER) private readonly reader: FinancialDataReader,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
  ) {}

  async execute(
    tenant: TenantContext,
    query: ReportQuery,
    ipAddress: string | null,
  ): Promise<ContributionExport> {
    assertReportRange(query);
    const scope = await this.scopes.resolve(tenant, query.congregationId);
    if (query.fundId !== null) {
      const funds = await this.reader.listFunds(scope.denominationId);
      if (!funds.some((fund) => fund.id === query.fundId)) {
        throw new NotFoundDomainException(
          'El fondo seleccionado no existe.',
          'FUND_NOT_FOUND',
        );
      }
    }

    const rows = await this.reader.listContributionDetail(
      this.scopes.filterOf(scope, query.fundId),
      query,
      MAX_EXPORT_ROWS + 1,
    );
    if (rows.length > MAX_EXPORT_ROWS) {
      throw new BusinessRuleException(
        `El rango tiene más de ${MAX_EXPORT_ROWS.toLocaleString('es-CO')} aportes: acórtalo para exportarlo.`,
        'EXPORT_TOO_LARGE',
      );
    }

    await this.audit.record({
      action: 'CONTRIBUTIONS_EXPORTED',
      entity: 'Contribution',
      entityId: `${query.from}..${query.to}`,
      actor: tenant,
      ipAddress,
      changes: buildAuditChanges(
        null,
        {
          rows: rows.length,
          fundId: query.fundId,
          scope: scope.wide ? 'denomination' : 'congregation',
        },
        ['rows', 'fundId', 'scope'],
      ),
    });

    return {
      fileName: `detalle-aportes_${query.from}_${query.to}.csv`,
      rows: rows.length,
      content: toCsvDocument(
        HEADERS,
        rows.map((row) => [
          csvDate(row.receivedOn),
          row.receipt ?? '',
          row.congregationName,
          row.contributionType,
          row.contributorName ?? ANONYMOUS,
          PAYMENT_METHOD_LABELS[row.paymentMethod],
          row.paymentReference ?? '',
          row.fundName ?? '—',
          row.amount,
          STATUS_LABELS[row.status],
        ]),
      ),
    };
  }
}
