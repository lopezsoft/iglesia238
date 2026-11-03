import type {
  ContributionDisplayStatus,
  PaymentMethod,
} from '../../contributions/domain/contribution.types.js';
import type { VowPledgeStatus } from '../domain/vow-pledge-rules.js';

/** A pledge as the repository reads it, with what has been paid already added up. */
export interface VowPledgeRecord {
  id: number;
  congregationId: number;
  congregationName: string;
  personId: number;
  /** Name and first surname. */
  personName: string;
  memberCode: string | null;
  contributionTypeId: number;
  typeName: string;
  description: string | null;
  pledgedAmount: number;
  pledgedOn: string;
  dueOn: string | null;
  /** The stored status; the row shows the one computed from the payments. */
  storedStatus: VowPledgeStatus;
  /** Sum of the contributions that are not voided. */
  paid: number;
  paymentCount: number;
  lastPaymentOn: string | null;
}

export interface VowPaymentRecord {
  id: number;
  receivedOn: string;
  receiptNumber: number | null;
  amount: number;
  paymentMethod: PaymentMethod;
  status: ContributionDisplayStatus;
  congregationName: string;
}

export interface VowPledgeDetailRecord extends VowPledgeRecord {
  documentTypeCode: string | null;
  documentNumber: string | null;
  /** Fund suggested by the account of the contribution type. */
  fundName: string | null;
  /** Newest first, voided payments included. */
  payments: readonly VowPaymentRecord[];
  /** Reason given when it was cancelled, read from the audit trail. */
  cancelReason: string | null;
}

/** The figures needed for the KPIs of every non-cancelled pledge of the scope. */
export interface VowPledgeFigures {
  id: number;
  pledgedAmount: number;
  pledgedOn: string;
  dueOn: string | null;
  status: VowPledgeStatus;
  paid: number;
  lastPaymentOn: string | null;
}

export interface VowPledgeRow {
  id: number;
  /** VOTO-2026-0014. */
  code: string;
  personId: number;
  personName: string;
  memberCode: string;
  contributionTypeId: number;
  typeName: string;
  description: string | null;
  pledgedAmount: number;
  pledgedOn: string;
  dueOn: string | null;
  /** Active, past its due date and still with a balance. */
  isOverdue: boolean;
  paid: number;
  balance: number;
  /** 0 to 100. */
  progress: number;
  status: VowPledgeStatus;
  lastPaymentOn: string | null;
  paymentCount: number;
  congregationName: string;
}

export interface VowPayment {
  id: number;
  receivedOn: string;
  receiptNumber: string;
  amount: number;
  paymentMethod: PaymentMethod;
  status: ContributionDisplayStatus;
  congregationName: string;
}

export interface VowPledgeDetail extends VowPledgeRow {
  /** "CC ···1904". */
  documentHint: string;
  fundName: string;
  payments: readonly VowPayment[];
  cancelReason: string | null;
}

export interface VowTypeOption {
  id: number;
  name: string;
}

export interface VowKpis {
  /** Pledged and paid by every pledge that is not cancelled. */
  pledgedTotal: number;
  paidTotal: number;
  balanceTotal: number;
  /** Pledges that are not cancelled. */
  pledgeCount: number;
  withBalanceCount: number;
  activeCount: number;
  /** Active pledges without a payment in the last 90 days. */
  staleCount: number;
  overdueCount: number;
}

export interface VowsOverview {
  today: string;
  congregationScoped: boolean;
  scopeLabel: string;
  vowTypes: readonly VowTypeOption[];
  kpis: VowKpis;
  statusCounts: Readonly<Record<VowPledgeStatus | 'ALL', number>>;
  items: readonly VowPledgeRow[];
  total: number;
  page: number;
  pageSize: number;
}

/** Pledge the contribution form offers as the target of a payment. */
export interface VowPledgeOption {
  id: number;
  /** VOTO-2026-0014 · Ampliación del templo · saldo $ 450.000 */
  label: string;
  personId: number;
  contributionTypeId: number;
  balance: number;
}
