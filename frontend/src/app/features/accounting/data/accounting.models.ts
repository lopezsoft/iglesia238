// Accounting context, mirroring backend/prisma/schema/accounting.prisma.
// Money (Decimal(14,2) in the API) travels as number of pesos; @db.Date fields as 'YYYY-MM-DD'
// and DateTime fields as ISO strings. Records are never deleted: they are voided or reversed.

export const ACCOUNT_NATURES = ['INCOME', 'EXPENSE'] as const;
export type AccountNature = (typeof ACCOUNT_NATURES)[number];

export const PERIOD_STATUSES = ['OPEN', 'CLOSED'] as const;
export type PeriodStatus = (typeof PERIOD_STATUSES)[number];

/** Direction of the money. A reversal uses the opposite direction of the original movement. */
export const CASH_DIRECTIONS = ['IN', 'OUT'] as const;
export type CashDirection = (typeof CASH_DIRECTIONS)[number];

/** Only TITHE enters the tithe settlement and only VOW accepts a pledge. */
export const CONTRIBUTION_CATEGORIES = ['TITHE', 'OFFERING', 'FIRST_FRUITS', 'VOW', 'OTHER'] as const;
export type ContributionCategory = (typeof CONTRIBUTION_CATEGORIES)[number];

export const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'CARD', 'BANK_DEPOSIT', 'OTHER'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CONTRIBUTION_STATUSES = ['RECORDED', 'VOIDED'] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export const VOW_PLEDGE_STATUSES = ['ACTIVE', 'FULFILLED', 'CANCELLED'] as const;
export type VowPledgeStatus = (typeof VOW_PLEDGE_STATUSES)[number];

export const TITHE_SETTLEMENT_STATUSES = ['ISSUED', 'VOIDED'] as const;
export type TitheSettlementStatus = (typeof TITHE_SETTLEMENT_STATUSES)[number];

export const BUDGET_TYPES = ['FIXED', 'COMMITTEE'] as const;
export type BudgetType = (typeof BUDGET_TYPES)[number];

export const BUDGET_STATUSES = ['DRAFT', 'APPROVED', 'CLOSED'] as const;
export type BudgetStatus = (typeof BUDGET_STATUSES)[number];

/**
 * Status shown for a contribution. The API stores RECORDED or VOIDED; a recorded contribution
 * that points to a tithe settlement is shown as SETTLED and can no longer be voided.
 */
export type ContributionDisplayStatus = 'RECORDED' | 'SETTLED' | 'VOIDED';

/** Voucher.type is free text in the API; these are the types the app issues. */
export const VOUCHER_TYPES = {
  /** Contribution receipt. */
  receipt: 'REC',
  /** Cash income not coming from a contribution. */
  cashIn: 'CI',
  /** Cash expense. */
  cashOut: 'CE',
  /** Tithe settlement document. */
  titheSettlement: 'LD',
} as const;
export type VoucherType = (typeof VOUCHER_TYPES)[keyof typeof VOUCHER_TYPES];

// ---------------------------------------------------------------------------------------------
// Rows

/** Fund or committee: Fondo Local, Misiones, Construcción, Damas, Jóvenes… */
export interface Fund {
  readonly id: number;
  readonly denominationId: number;
  readonly name: string;
  readonly isActive: boolean;
}

/** Chart of accounts. Groups (isPostable false) never receive movements. */
export interface Account {
  readonly id: number;
  readonly denominationId: number;
  /** Only a suggestion: the real fund is stored on each movement. */
  readonly defaultFundId: number | null;
  readonly parentId: number | null;
  readonly code: string;
  readonly legacyCode: string | null;
  readonly name: string;
  readonly nature: AccountNature;
  readonly isPostable: boolean;
  readonly isActive: boolean;
}

export interface ContributionType {
  readonly id: number;
  readonly denominationId: number;
  readonly category: ContributionCategory;
  readonly code: string;
  readonly name: string;
  /** A postable INCOME account. */
  readonly accountId: number;
  readonly isActive: boolean;
}

/** Balance a fund carries into a year in a congregation. Monthly balances are computed. */
export interface FundOpeningBalance {
  readonly denominationId: number;
  readonly congregationId: number;
  readonly fundId: number;
  readonly year: number;
  readonly amount: number;
}

export interface AccountingPeriod {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly year: number;
  /** 1–12. */
  readonly month: number;
  readonly status: PeriodStatus;
  readonly closedAt: string | null;
}

export interface Voucher {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly type: VoucherType;
  /** Consecutive per congregation and type. */
  readonly number: number;
  readonly issuedOn: string;
  readonly signerId: number | null;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
}

/** Cash book line. `amount` is always positive; `direction` gives the sense. */
export interface CashTransaction {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly periodId: number;
  readonly accountId: number;
  readonly fundId: number;
  readonly voucherId: number | null;
  readonly direction: CashDirection;
  readonly postedOn: string;
  readonly amount: number;
  readonly description: string;
  /** Set on a reversal: same account, fund and amount, opposite direction. */
  readonly reversalOfId: number | null;
  readonly createdById: number;
  readonly createdAt: string;
}

/** Vow promise. What has been paid is never stored: it is the sum of its contributions. */
export interface VowPledge {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly personId: number;
  readonly contributionTypeId: number;
  readonly description: string | null;
  readonly pledgedAmount: number;
  readonly pledgedOn: string;
  readonly dueOn: string | null;
  readonly status: VowPledgeStatus;
  readonly createdAt: string;
}

/** Tithe, offering, first fruits or vow payment. `personId` null: anonymous or aggregated. */
export interface Contribution {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly contributionTypeId: number;
  readonly personId: number | null;
  readonly vowPledgeId: number | null;
  readonly cashTransactionId: number | null;
  /** Receipt (voucher of type REC). */
  readonly voucherId: number | null;
  readonly titheSettlementId: number | null;
  readonly receivedOn: string;
  readonly amount: number;
  readonly paymentMethod: PaymentMethod;
  readonly paymentReference: string | null;
  readonly notes: string | null;
  readonly status: ContributionStatus;
  readonly recordedById: number;
  readonly voidedById: number | null;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
  readonly createdAt: string;
}

/**
 * Settlement percentages in force from a date.
 * nationalShare = gross × nationalShareRate
 * localFundShare = (gross − nationalShare) × localFundRate
 * pastorNet = gross − nationalShare − localFundShare
 */
export interface TitheSettlementRule {
  readonly id: number;
  readonly denominationId: number;
  readonly effectiveFrom: string;
  /** 0–1 (Decimal(5,4)). */
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}

/** Issued document: it copies rates and amounts so a future rule never changes the past. */
export interface TitheSettlement {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly voucherId: number | null;
  readonly pastorId: number | null;
  readonly settledOn: string;
  readonly coveredFrom: string;
  readonly coveredTo: string;
  readonly grossTithe: number;
  readonly nationalShareRate: number;
  readonly localFundRate: number;
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
  readonly status: TitheSettlementStatus;
  readonly voidedById: number | null;
  readonly voidedAt: string | null;
  readonly voidReason: string | null;
  readonly createdAt: string;
}

export interface Budget {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly year: number;
  readonly type: BudgetType;
  readonly incomeIncreaseRate: number | null;
  readonly status: BudgetStatus;
}

/** `monthlyAmount` is optional: some concepts are not twelve times a monthly value. */
export interface BudgetLine {
  readonly id: number;
  readonly denominationId: number;
  readonly budgetId: number;
  readonly accountId: number;
  readonly fundId: number;
  readonly monthlyAmount: number | null;
  readonly annualAmount: number;
}

// ---------------------------------------------------------------------------------------------
// Views shared by the accounting screens

/** Person found by the contributor search (contributions, vows). Never the full document. */
export interface PersonOption {
  readonly id: number;
  readonly fullName: string;
  /** Member code in its current sede (SC-0130) or '—'. */
  readonly memberCode: string;
  readonly congregationName: string;
  /** Document type and last digits only, e.g. "CC ···1904". */
  readonly documentHint: string;
}

export interface PeriodOption {
  readonly year: number;
  readonly month: number;
  readonly status: PeriodStatus;
  readonly label: string;
}

// ---------------------------------------------------------------------------------------------
// Spanish labels

export const ACCOUNT_NATURE_LABELS: Readonly<Record<AccountNature, string>> = {
  INCOME: 'Ingreso',
  EXPENSE: 'Egreso',
};

export const PERIOD_STATUS_LABELS: Readonly<Record<PeriodStatus, string>> = {
  OPEN: 'Abierto',
  CLOSED: 'Cerrado',
};

export const CASH_DIRECTION_LABELS: Readonly<Record<CashDirection, string>> = {
  IN: 'Ingreso',
  OUT: 'Egreso',
};

export const CONTRIBUTION_CATEGORY_LABELS: Readonly<Record<ContributionCategory, string>> = {
  TITHE: 'Diezmo',
  OFFERING: 'Ofrenda',
  FIRST_FRUITS: 'Primicia',
  VOW: 'Voto',
  OTHER: 'Otro',
};

/** Plural labels for summaries ("Diezmos", "Ofrendas"…). */
export const CONTRIBUTION_CATEGORY_PLURALS: Readonly<Record<ContributionCategory, string>> = {
  TITHE: 'Diezmos',
  OFFERING: 'Ofrendas',
  FIRST_FRUITS: 'Primicias',
  VOW: 'Votos',
  OTHER: 'Otros aportes',
};

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Datáfono',
  BANK_DEPOSIT: 'Consignación',
  OTHER: 'Otro',
};

/** Methods that need a payment reference (transaction, approval or deposit number). */
export const METHODS_WITH_REFERENCE: readonly PaymentMethod[] = ['BANK_TRANSFER', 'CARD', 'BANK_DEPOSIT'];

export const CONTRIBUTION_STATUS_LABELS: Readonly<Record<ContributionDisplayStatus, string>> = {
  RECORDED: 'Registrado',
  SETTLED: 'Liquidado',
  VOIDED: 'Anulado',
};

export const VOW_PLEDGE_STATUS_LABELS: Readonly<Record<VowPledgeStatus, string>> = {
  ACTIVE: 'Activa',
  FULFILLED: 'Cumplida',
  CANCELLED: 'Cancelada',
};

export const TITHE_SETTLEMENT_STATUS_LABELS: Readonly<Record<TitheSettlementStatus, string>> = {
  ISSUED: 'Emitida',
  VOIDED: 'Anulada',
};

export const BUDGET_TYPE_LABELS: Readonly<Record<BudgetType, string>> = {
  FIXED: 'Presupuesto fijo',
  COMMITTEE: 'Presupuesto por comités',
};

export const BUDGET_STATUS_LABELS: Readonly<Record<BudgetStatus, string>> = {
  DRAFT: 'Borrador',
  APPROVED: 'Aprobado',
  CLOSED: 'Cerrado',
};

export const VOUCHER_TYPE_LABELS: Readonly<Record<VoucherType, string>> = {
  REC: 'Recibo de aporte',
  CI: 'Comprobante de ingreso',
  CE: 'Comprobante de egreso',
  LD: 'Liquidación del diezmo',
};

export const MONTH_NAMES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;
