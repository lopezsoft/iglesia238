import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import { VoucherTypes } from '../../../common/accounting/accounting-rules.js';
import { maskDocument } from '../../contributions/domain/contribution-rules.js';
import {
  vowBalance,
  vowPledgeCode,
  vowPledgeStatusFor,
  vowProgress,
} from '../domain/vow-pledge-rules.js';
import type {
  VowPledgeDetail,
  VowPledgeDetailRecord,
  VowPledgeRecord,
  VowPledgeRow,
} from './vow-pledge.models.js';

export function toVowPledgeRow(
  record: VowPledgeRecord,
  today: string,
): VowPledgeRow {
  const status = vowPledgeStatusFor(
    record.storedStatus,
    record.pledgedAmount,
    record.paid,
  );
  return {
    id: record.id,
    code: vowPledgeCode(record),
    personId: record.personId,
    personName: record.personName,
    memberCode: record.memberCode ?? '—',
    contributionTypeId: record.contributionTypeId,
    typeName: record.typeName,
    description: record.description,
    pledgedAmount: record.pledgedAmount,
    pledgedOn: record.pledgedOn,
    dueOn: record.dueOn,
    isOverdue:
      status === 'ACTIVE' && record.dueOn !== null && record.dueOn < today,
    paid: record.paid,
    balance: vowBalance(record.pledgedAmount, record.paid),
    progress: vowProgress(record.pledgedAmount, record.paid),
    status,
    lastPaymentOn: record.lastPaymentOn,
    paymentCount: record.paymentCount,
    congregationName: record.congregationName,
  };
}

export function toVowPledgeDetail(
  record: VowPledgeDetailRecord,
  today: string,
): VowPledgeDetail {
  return {
    ...toVowPledgeRow(record, today),
    documentHint: maskDocument(record.documentTypeCode, record.documentNumber),
    fundName: record.fundName ?? '—',
    payments: record.payments.map((payment) => ({
      id: payment.id,
      receivedOn: payment.receivedOn,
      receiptNumber:
        payment.receiptNumber === null
          ? '—'
          : formatVoucherCode(
              VoucherTypes.receipt,
              payment.receivedOn,
              payment.receiptNumber,
            ),
      amount: payment.amount,
      paymentMethod: payment.paymentMethod,
      status: payment.status,
      congregationName: payment.congregationName,
    })),
    cancelReason: record.cancelReason,
  };
}
