import { Inject, Injectable } from '@nestjs/common';
import {
  AUDIT_RECORDER,
  type AuditRecorder,
} from '../../../common/audit/audit-recorder.port.js';
import { csvDate, toCsvDocument } from '../../../common/export/csv-document.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { MAX_EXPORT_ROWS } from '../../contributions/domain/contribution.types.js';
import { toVowPledgeRow } from './vow-pledge-mappers.js';
import type { ListVowPledgesInput } from './list-vow-pledges.use-case.js';
import { VOWS_REPOSITORY, type VowsRepository } from './vows.repository.js';

export interface VowPledgesExport {
  filename: string;
  content: string;
  rows: number;
}

const STATUS_LABELS = {
  ACTIVE: 'Activa',
  FULFILLED: 'Cumplida',
  CANCELLED: 'Cancelada',
} as const;

const HEADERS = [
  'Código',
  'Persona',
  'Código de miembro',
  'Sede',
  'Tipo de aporte',
  'Fecha de promesa',
  'Fecha límite',
  'Prometido',
  'Abonado',
  'Saldo',
  'Avance %',
  'Estado',
  'Último abono',
  'Abonos',
  'Observaciones',
] as const;

/** CSV of the pledges of the filter (names included, so it is audited like the contributions export). */
@Injectable()
export class ExportVowPledgesUseCase {
  constructor(
    @Inject(VOWS_REPOSITORY) private readonly repository: VowsRepository,
    @Inject(AUDIT_RECORDER) private readonly audit: AuditRecorder,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: Omit<ListVowPledgesInput, 'page' | 'pageSize'>,
    ipAddress: string | null = null,
  ): Promise<VowPledgesExport> {
    const scope =
      input.congregationId !== undefined
        ? tenant.congregationScope(input.congregationId)
        : tenant.tenantScope();
    const today = this.clock.today();
    const records = await this.repository.findAll(
      scope,
      {
        status: input.status,
        contributionTypeId: input.contributionTypeId,
        search: input.search?.trim() || undefined,
        overdueOnly: input.overdueOnly,
        today,
      },
      MAX_EXPORT_ROWS,
    );
    const rows = records.map((record) => toVowPledgeRow(record, today));

    await this.audit.record({
      action: 'VOW_PLEDGES_EXPORTED',
      entity: 'VowPledge',
      entityId: 'EXPORT',
      actor: tenant,
      changes: { rows: { from: null, to: rows.length } },
      ipAddress,
    });

    return {
      filename: `votos-${today}.csv`,
      rows: rows.length,
      content: toCsvDocument(
        HEADERS,
        rows.map((row) => [
          row.code,
          row.personName,
          row.memberCode,
          row.congregationName,
          row.typeName,
          csvDate(row.pledgedOn),
          csvDate(row.dueOn),
          row.pledgedAmount,
          row.paid,
          row.balance,
          row.progress,
          STATUS_LABELS[row.status],
          csvDate(row.lastPaymentOn),
          row.paymentCount,
          row.description ?? '',
        ]),
      ),
    };
  }
}
