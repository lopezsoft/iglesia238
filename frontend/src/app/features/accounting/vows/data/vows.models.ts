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
  /** Sum of the non-voided linked contributions. */
  readonly paid: number;
  readonly balance: number;
  /** 0–100. */
  readonly progress: number;
  /** Computed from the stored status and the paid amount. */
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
}

export interface VowTypeOption {
  readonly id: number;
  readonly name: string;
}

export interface VowsOverview {
  readonly today: string;
  readonly congregationScoped: boolean;
  readonly scopeLabel: string;
  readonly rows: readonly VowPledgeRow[];
  /** Active contribution types of category VOW. */
  readonly vowTypes: readonly VowTypeOption[];
}

export interface CreateVowPledgeCommand {
  readonly personId: number;
  readonly contributionTypeId: number;
  readonly pledgedAmount: number;
  readonly pledgedOn: string;
  readonly description: string | null;
}
