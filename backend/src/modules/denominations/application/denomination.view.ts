import { toIsoDateTime } from '../../../common/mappers/value-mappers.js';
import type { DenominationRecord } from './denomination.repository.port.js';

export interface DenominationSummaryView {
  readonly id: number;
  readonly name: string;
  readonly isActive: boolean;
  readonly createdAt: string;
  readonly legalEntityCount: number;
  readonly congregationCount: number;
}

export function toDenominationView(
  record: DenominationRecord,
): DenominationSummaryView {
  return {
    id: record.id,
    name: record.name,
    isActive: record.isActive,
    createdAt: toIsoDateTime(record.createdAt),
    legalEntityCount: record.legalEntityCount,
    congregationCount: record.congregationCount,
  };
}
