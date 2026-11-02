// Fictional contributions recorded on the demo "today" without a cash line yet: the envelopes of
// the Monday prayer service, which the treasurer consolidates from the cash book (one inflow per
// account). Applied once through AccountingDemoStore.ensurePendingContributions(), so the seed
// invariants (every seeded contribution has its own cash line) keep holding.
import { Member } from '../../../core/models/membership.model';
import { ACCOUNTING_DEMO_TODAY, DEMO_CONTRIBUTION_TYPES } from './accounting-demo-seed';
import { Contribution, PaymentMethod, VOUCHER_TYPES, Voucher } from './accounting.models';

interface PendingSeed {
  readonly congregationId: number;
  readonly typeId: number;
  /** Index into the active members of the congregation; null for anonymous or collections. */
  readonly slot: number | null;
  readonly amount: number;
  readonly method: PaymentMethod;
  readonly reference: string | null;
  readonly notes: string | null;
}

const T = DEMO_CONTRIBUTION_TYPES;
const ENVELOPES = 'Sobres del culto de oración del lunes';

const PENDING: readonly PendingSeed[] = [
  // Sede Central · Fondo Local: 6 contributions, $ 1.240.000
  { congregationId: 1, typeId: T.tithe, slot: 5, amount: 300_000, method: 'CASH', reference: null, notes: null },
  { congregationId: 1, typeId: T.tithe, slot: 6, amount: 250_000, method: 'CASH', reference: null, notes: null },
  { congregationId: 1, typeId: T.tithe, slot: null, amount: 90_000, method: 'CASH', reference: null, notes: null },
  { congregationId: 1, typeId: T.offering, slot: null, amount: 410_000, method: 'CASH', reference: null, notes: ENVELOPES },
  { congregationId: 1, typeId: T.firstFruits, slot: 9, amount: 120_000, method: 'BANK_TRANSFER', reference: 'TRX 884310', notes: null },
  { congregationId: 1, typeId: T.offering, slot: 7, amount: 70_000, method: 'CASH', reference: null, notes: null },
  // Sede Central · Fondo de Misiones: 2 contributions, $ 180.000
  { congregationId: 1, typeId: T.missionOffering, slot: null, amount: 130_000, method: 'CASH', reference: null, notes: ENVELOPES },
  { congregationId: 1, typeId: T.missionOffering, slot: 2, amount: 50_000, method: 'CASH', reference: null, notes: null },
  // Sede Norte: proves that another sede never consolidates them
  { congregationId: 2, typeId: T.tithe, slot: 1, amount: 200_000, method: 'CASH', reference: null, notes: null },
];

const RECORDER_BY_CONGREGATION: Readonly<Record<number, number>> = { 1: 5, 2: 6 };

/** Minimal store surface the fixture needs (keeps this file free of a circular import). */
export interface PendingContributionsTarget {
  readonly contributions: Contribution[];
  nextId(table: readonly { readonly id: number }[]): number;
  issueVoucher(input: { denominationId: number; congregationId: number; type: Voucher['type']; issuedOn: string }): Voucher;
}

export function seedPendingContributions(target: PendingContributionsTarget, members: readonly Member[]): void {
  for (const seed of PENDING) {
    const personId = seed.slot === null ? null : personAt(members, seed.congregationId, seed.slot);
    const receipt = target.issueVoucher({
      denominationId: 1,
      congregationId: seed.congregationId,
      type: VOUCHER_TYPES.receipt,
      issuedOn: ACCOUNTING_DEMO_TODAY,
    });
    const recorder = RECORDER_BY_CONGREGATION[seed.congregationId] ?? 5;
    target.contributions.push({
      id: target.nextId(target.contributions),
      denominationId: 1,
      congregationId: seed.congregationId,
      contributionTypeId: seed.typeId,
      personId,
      vowPledgeId: null,
      cashTransactionId: null,
      voucherId: receipt.id,
      titheSettlementId: null,
      receivedOn: ACCOUNTING_DEMO_TODAY,
      amount: seed.amount,
      paymentMethod: seed.method,
      paymentReference: seed.reference,
      notes: personId === null ? seed.notes : null,
      status: 'RECORDED',
      recordedById: recorder,
      voidedById: null,
      voidedAt: null,
      voidReason: null,
      createdAt: `${ACCOUNTING_DEMO_TODAY}T23:10:00Z`,
    });
  }
}

/** Active member of a congregation by position; null (anonymous) when the slot does not exist. */
function personAt(members: readonly Member[], congregationId: number, slot: number): number | null {
  const people = members
    .filter((m) => m.congregationId === congregationId && m.status === 'ACTIVE')
    .sort((a, b) => a.id - b.id);
  return people[slot]?.personId ?? null;
}
