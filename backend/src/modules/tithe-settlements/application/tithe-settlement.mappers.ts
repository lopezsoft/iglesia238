import type {
  SettlementRecord,
  TitheContributionData,
  TitheContributionRow,
  TitheRuleView,
  TitheSettlementRow,
} from './tithe-settlement.models.js';
import { settlementNumber } from './tithe-range.js';
import type { TitheRuleRecord } from './tithe-settlement.ports.js';

export function toRuleView(
  rule: TitheRuleRecord,
  inForceId: number | null,
): TitheRuleView {
  return {
    id: rule.id,
    effectiveFrom: rule.effectiveFrom,
    nationalShareRate: rule.nationalShareRate,
    localFundRate: rule.localFundRate,
    inForce: rule.id === inForceId,
  };
}

export function toSettlementRow(record: SettlementRecord): TitheSettlementRow {
  return {
    id: record.id,
    number: settlementNumber(record),
    coveredFrom: record.coveredFrom,
    coveredTo: record.coveredTo,
    settledOn: record.settledOn,
    grossTithe: record.grossTithe,
    nationalShare: record.nationalShare,
    localFundShare: record.localFundShare,
    pastorNet: record.pastorNet,
    nationalShareRate: record.nationalShareRate,
    localFundRate: record.localFundRate,
    contributionCount: record.contributionCount,
    status: record.status,
    voidReason: record.voidReason,
    voidedAt: record.voidedAt,
  };
}

export function toContributionRow(
  data: TitheContributionData,
): TitheContributionRow {
  return {
    id: data.id,
    receiptNumber: data.receiptNumber,
    receivedOn: data.receivedOn,
    contributorName: data.contributorName,
    memberCode: data.memberCode,
    paymentMethod: data.paymentMethod,
    amount: data.amount,
  };
}
