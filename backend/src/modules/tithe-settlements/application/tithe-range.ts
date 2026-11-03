import { displayDate } from '../../../common/accounting/accounting-rules.js';
import {
  ConflictDomainException,
  InvalidInputException,
} from '../../../common/errors/domain.exception.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import type {
  SettlementRecord,
  TitheRangeView,
} from './tithe-settlement.models.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';

/** The range must be real, ordered and not in the future (the tithes of tomorrow do not exist yet). */
export function assertSettlementRange(
  { from, to }: TitheRangeView,
  today: string,
): void {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new InvalidInputException(
      'Indica las dos fechas del rango.',
      'INVALID_RANGE',
    );
  }
  if (from > to) {
    throw new InvalidInputException(
      'La fecha «hasta» debe ser igual o posterior a la fecha «desde».',
      'INVALID_RANGE',
    );
  }
  if (to > today) {
    throw new InvalidInputException(
      'La fecha «hasta» no puede ser posterior a hoy.',
      'FUTURE_RANGE',
    );
  }
}

/** "LD-2026-00001" for a settlement; falls back to the id when the voucher is missing. */
export function settlementNumber(record: SettlementRecord): string {
  if (
    record.voucherType === null ||
    record.voucherNumber === null ||
    record.voucherIssuedOn === null
  ) {
    return `LD-${record.id}`;
  }
  return formatVoucherCode(
    record.voucherType,
    record.voucherIssuedOn,
    record.voucherNumber,
  );
}

export function overlappingSettlementError(
  overlapping: SettlementRecord,
): ConflictDomainException {
  return new ConflictDomainException(
    `El rango se solapa con la liquidación ${settlementNumber(overlapping)} (${displayDate(overlapping.coveredFrom)} – ${displayDate(overlapping.coveredTo)}). Elige fechas posteriores al ${displayDate(overlapping.coveredTo)}.`,
    'OVERLAPPING_SETTLEMENT',
  );
}
