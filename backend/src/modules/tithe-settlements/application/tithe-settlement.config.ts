import {
  VoucherTypes,
  type VoucherType,
} from '../../../common/accounting/accounting-rules.js';

/**
 * Where a tithe settlement books what the sede pays out, in one place. The rule has no column for
 * these accounts, so they are resolved by code in the chart of accounts of the denomination (the
 * template that provisions a new denomination creates both). A line whose account does not exist is
 * not booked, and the preview tells the treasurer so before confirming.
 */
export interface TitheSettlementLedgerConfig {
  readonly voucherType: VoucherType;
  /** Expense accounts of the amounts the sede pays when it settles. The local fund share stays in the sede. */
  readonly payableAccountCodes: {
    readonly nationalShare: string;
    readonly pastorNet: string;
  };
  /** Fund that receives the lines of an account without a suggested fund, and the "local fund" of the preview. */
  readonly localFundName: string;
  readonly descriptions: {
    readonly nationalShare: string;
    readonly pastorNet: string;
  };
}

export const TITHE_SETTLEMENT_LEDGER: TitheSettlementLedgerConfig = {
  voucherType: VoucherTypes.titheSettlement,
  payableAccountCodes: { nationalShare: '530505', pastorNet: '530510' },
  localFundName: 'Fondo Local',
  descriptions: {
    nationalShare: 'Participación nacional del diezmo',
    pastorNet: 'Asignación pastoral',
  },
};

/** Bounds of the reason written when a settlement is voided. */
export const MIN_VOID_REASON_LENGTH = 10;
export const MAX_VOID_REASON_LENGTH = 255;
