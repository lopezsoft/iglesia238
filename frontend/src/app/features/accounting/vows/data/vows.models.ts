import { ContributionDisplayStatus, PaymentMethod, VowPledgeStatus } from '../../data/accounting.models';

export interface VowPledgeRow {
  readonly id: number;
  /** VOTO-2026-0014. */
  readonly code: string;
  readonly personId: number;
  readonly personName: string;
  readonly memberCode: string;
  readonly contributionTypeId: number;
  readonly typeName: string;
  readonly description: string | null;
  readonly pledgedAmount: number;
  readonly pledgedOn: string;
  /** Agreed deadline, if any. */
  readonly dueOn: string | null;
  /** Active, past its deadline and still with a balance. */
  readonly isOverdue: boolean;
  /** Sum of the non-voided linked contributions. */
  readonly paid: number;
  readonly balance: number;
  /** 0–100. */
  readonly progress: number;
  readonly status: VowPledgeStatus;
  readonly lastPaymentOn: string | null;
  readonly paymentCount: number;
  readonly congregationName: string;
}

export interface VowPayment {
  readonly id: number;
  readonly receivedOn: string;
  readonly receiptNumber: string;
  readonly amount: number;
  readonly paymentMethod: PaymentMethod;
  readonly status: ContributionDisplayStatus;
  /** Sede where the payment was received (it can differ after a transfer). */
  readonly congregationName: string;
}

export interface VowPledgeDetail extends VowPledgeRow {
  readonly documentHint: string;
  readonly fundName: string;
  /** Newest first, voided payments included (they do not count). */
  readonly payments: readonly VowPayment[];
  /** Why it was cancelled, when it was. */
  readonly cancelReason: string | null;
}

export interface VowTypeOption {
  readonly id: number;
  readonly name: string;
}

/** Indicators of the pledges that are not cancelled, for the whole scope (not only the page). */
export interface VowKpis {
  readonly pledgedTotal: number;
  readonly paidTotal: number;
  readonly balanceTotal: number;
  readonly pledgeCount: number;
  readonly withBalanceCount: number;
  readonly activeCount: number;
  /** Active pledges without a payment in the last 90 days. */
  readonly staleCount: number;
  readonly overdueCount: number;
}

export type VowStatusCounts = Readonly<Record<VowPledgeStatus | 'ALL', number>>;

/** One page of pledges plus everything the screen needs around it. */
export interface VowsOverview {
  readonly today: string;
  readonly congregationScoped: boolean;
  readonly scopeLabel: string;
  /** Active contribution types of category VOW. */
  readonly vowTypes: readonly VowTypeOption[];
  readonly kpis: VowKpis;
  readonly statusCounts: VowStatusCounts;
  readonly items: readonly VowPledgeRow[];
  readonly total: number;
  readonly page: number;
  readonly pageSize: number;
}

export interface VowFilters {
  readonly status?: VowPledgeStatus | null;
  readonly contributionTypeId?: number | null;
  readonly search?: string | null;
  readonly overdueOnly?: boolean;
}

export interface VowsQuery extends VowFilters {
  /** 1-based. */
  readonly page: number;
  readonly pageSize: number;
}

export interface CreateVowPledgeCommand {
  readonly personId: number;
  readonly contributionTypeId: number;
  readonly pledgedAmount: number;
  readonly pledgedOn: string;
  readonly dueOn: string | null;
  readonly description: string | null;
}

/** Only what is sent changes; null clears the deadline and the observations. */
export interface UpdateVowPledgeCommand {
  readonly pledgedAmount?: number;
  readonly dueOn?: string | null;
  readonly description?: string | null;
}
