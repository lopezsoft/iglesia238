import {
  decimalToNumber,
  toIsoDate,
  toIsoDateOrNull,
  toIsoDateTimeOrNull,
} from '../../../common/mappers/value-mappers.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { SettlementRecord } from '../application/tithe-settlement.models.js';

/** Columns every read of a settlement needs, with its voucher and the number of linked tithes. */
export const SETTLEMENT_SELECT = {
  id: true,
  settledOn: true,
  coveredFrom: true,
  coveredTo: true,
  grossTithe: true,
  nationalShareRate: true,
  localFundRate: true,
  nationalShare: true,
  localFundShare: true,
  pastorNet: true,
  status: true,
  voidedAt: true,
  voidReason: true,
  voucher: { select: { type: true, number: true, issuedOn: true } },
  _count: { select: { contributions: true } },
} satisfies Prisma.TitheSettlementSelect;

export type SettlementRow = Prisma.TitheSettlementGetPayload<{
  select: typeof SETTLEMENT_SELECT;
}>;

export function toSettlementRecord(row: SettlementRow): SettlementRecord {
  return {
    id: row.id,
    voucherType: row.voucher?.type ?? null,
    voucherNumber: row.voucher?.number ?? null,
    voucherIssuedOn: toIsoDateOrNull(row.voucher?.issuedOn),
    settledOn: toIsoDate(row.settledOn),
    coveredFrom: toIsoDate(row.coveredFrom),
    coveredTo: toIsoDate(row.coveredTo),
    grossTithe: decimalToNumber(row.grossTithe),
    nationalShareRate: decimalToNumber(row.nationalShareRate),
    localFundRate: decimalToNumber(row.localFundRate),
    nationalShare: decimalToNumber(row.nationalShare),
    localFundShare: decimalToNumber(row.localFundShare),
    pastorNet: decimalToNumber(row.pastorNet),
    status: row.status,
    voidedAt: toIsoDateTimeOrNull(row.voidedAt),
    voidReason: row.voidReason,
    contributionCount: row._count.contributions,
  };
}

/** Name of a person: the full name when there is one, otherwise the pieces. */
export function personDisplayName(person: {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  secondLastName: string | null;
}): string | null {
  if (person.fullName && person.fullName.trim() !== '') {
    return person.fullName.trim();
  }
  const pieces = [person.firstName, person.lastName, person.secondLastName]
    .filter((piece): piece is string => !!piece && piece.trim() !== '')
    .map((piece) => piece.trim());
  return pieces.length > 0 ? pieces.join(' ') : null;
}
