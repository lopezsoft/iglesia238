import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import { vowPledgeCode } from '../../vows/domain/vow-pledge-rules.js';
import { displayStatusOf, voidBlockOf } from '../domain/contribution-rules.js';
import { VoucherTypes } from '../../../common/accounting/accounting-rules.js';
import type {
  ContributionDetail,
  ContributionDetailRecord,
  ContributionRecord,
  ContributionRow,
} from './contribution.models.js';

/** REC-2026-01872: the year is the one of the date on the voucher, the number never restarts. */
export function receiptCode(
  receiptNumber: number | null,
  receivedOn: string,
): string {
  return receiptNumber === null
    ? '—'
    : formatVoucherCode(VoucherTypes.receipt, receivedOn, receiptNumber);
}

export function toContributionRow(record: ContributionRecord): ContributionRow {
  return {
    id: record.id,
    receiptNumber: receiptCode(record.receiptNumber, record.receivedOn),
    voucherId: record.voucherId,
    receivedOn: record.receivedOn,
    contributionTypeId: record.contributionTypeId,
    typeName: record.typeName,
    category: record.category,
    personId: record.personId,
    contributorName: record.contributorName,
    memberCode: record.memberCode,
    vowPledgeId: record.vowPledgeId,
    vowPledgeCode:
      record.vowPledgeId !== null && record.vowPledgedOn !== null
        ? vowPledgeCode({
            id: record.vowPledgeId,
            pledgedOn: record.vowPledgedOn,
          })
        : null,
    paymentMethod: record.paymentMethod,
    paymentReference: record.paymentReference,
    notes: record.notes,
    amount: record.amount,
    status: displayStatusOf(record),
    voidBlock: voidBlockOf(record),
    voidReason: record.voidReason,
    congregationName: record.congregationName,
  };
}

export function toContributionDetail(
  record: ContributionDetailRecord,
): ContributionDetail {
  return {
    ...toContributionRow(record),
    recordedAt: record.recordedAt,
    recordedByName: record.recordedByName,
    voidedAt: record.voidedAt,
    voidedByName: record.voidedByName,
    consolidationVoucher:
      record.consolidationNumber !== null && record.consolidationIssuedOn
        ? formatVoucherCode(
            VoucherTypes.cashIn,
            record.consolidationIssuedOn,
            record.consolidationNumber,
          )
        : null,
    settlementId: record.settlementId,
  };
}
