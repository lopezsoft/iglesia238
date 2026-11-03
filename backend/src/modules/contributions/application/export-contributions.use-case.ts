import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { csvDate, toCsvDocument } from '../../../common/export/csv-document.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import {
  CONTRIBUTION_CATEGORY_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
} from '../domain/contribution-labels.js';
import { MAX_EXPORT_ROWS } from '../domain/contribution.types.js';
import { toContributionRow } from './contribution-mappers.js';
import {
  type ContributionQuery,
  resolvePeriod,
  toFilter,
} from './contribution-query.js';
import {
  CONTRIBUTIONS_REPOSITORY,
  type ContributionsRepository,
} from './contributions.repository.js';

export interface ContributionsExport {
  filename: string;
  content: string;
  rows: number;
}

const HEADERS = [
  'Fecha',
  'Recibo',
  'Tipo de aporte',
  'Categoría',
  'Aportante',
  'Código de miembro',
  'Promesa de voto',
  'Sede',
  'Medio de pago',
  'Referencia',
  'Valor',
  'Estado',
  'Descripción',
  'Motivo de anulación',
] as const;

/**
 * CSV with the contributions of the filter, sede by sede when denomination-wide. It carries names,
 * so it needs contributions.read and leaves an audit entry with the number of rows (no names).
 */
@Injectable()
export class ExportContributionsUseCase {
  constructor(
    @Inject(CONTRIBUTIONS_REPOSITORY)
    private readonly repository: ContributionsRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    query: ContributionQuery,
    ipAddress: string | null = null,
  ): Promise<ContributionsExport> {
    const scope =
      query.congregationId !== undefined
        ? tenant.congregationScope(query.congregationId)
        : tenant.tenantScope();
    const period = resolvePeriod(query, this.clock.today());
    const records = await this.repository.findAll(
      scope,
      toFilter(query, period),
      MAX_EXPORT_ROWS,
    );
    const rows = records.map(toContributionRow);

    await this.audit.record({
      action: 'CONTRIBUTIONS_EXPORTED',
      entity: 'Contribution',
      entityId: 'EXPORT',
      actor: tenant,
      changes: { rows: { from: null, to: rows.length } },
      ipAddress,
    });

    const content = toCsvDocument(
      HEADERS,
      rows.map((row) => [
        csvDate(row.receivedOn),
        row.receiptNumber,
        row.typeName,
        CONTRIBUTION_CATEGORY_LABELS[row.category],
        row.contributorName ?? (row.notes ? 'Colecta agregada' : 'Anónimo'),
        row.memberCode ?? '',
        row.vowPledgeCode ?? '',
        row.congregationName,
        PAYMENT_METHOD_LABELS[row.paymentMethod],
        row.paymentReference ?? '',
        row.amount,
        CONTRIBUTION_STATUS_LABELS[row.status],
        row.notes ?? '',
        row.voidReason ?? '',
      ]),
    );
    return {
      filename: `aportes-${period.from}_${period.to}.csv`,
      content,
      rows: rows.length,
    };
  }
}
