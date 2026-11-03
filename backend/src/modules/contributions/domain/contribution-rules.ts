import { formatMemberCode } from '../../../common/numbering/document-numbering.service.js';
import {
  CONTRIBUTION_CATEGORIES,
  ContributionCategory,
  ContributionDisplayStatus,
  ContributionStatus,
  ContributionVoidBlock,
  MAIN_CATEGORIES,
} from './contribution.types.js';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';

/** Money in cents, to add and compare amounts without float error. */
export {
  fromCents,
  roundMoney,
  toCents,
} from '../../../common/accounting/accounting-rules.js';

export function displayStatusOf(contribution: {
  status: ContributionStatus;
  settled: boolean;
}): ContributionDisplayStatus {
  if (contribution.status === 'VOIDED') {
    return 'VOIDED';
  }
  return contribution.settled ? 'SETTLED' : 'RECORDED';
}

/** Why "Anular" is refused, or null when it is allowed (or the contribution is already voided). */
export function voidBlockOf(contribution: {
  status: ContributionStatus;
  settled: boolean;
  consolidated: boolean;
}): ContributionVoidBlock | null {
  if (contribution.status === 'VOIDED') {
    return null;
  }
  if (contribution.settled) {
    return 'SETTLED';
  }
  return contribution.consolidated ? 'CONSOLIDATED' : null;
}

/** "Ana Pérez": name and first surname. Falls back to the full name for relatives registered only with it. */
export function shortPersonName(person: {
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
}): string | null {
  const composed = [person.firstName, person.lastName]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' ')
    .trim();
  return composed !== '' ? composed : person.fullName?.trim() || null;
}

/** "CC ···1904": document type and last digits only. The full document never leaves the server. */
export function maskDocument(
  typeCode: string | null,
  documentNumber: string | null,
): string {
  if (!documentNumber) {
    return '—';
  }
  const tail = documentNumber.replace(/[^A-Za-z0-9]/g, '').slice(-4);
  return `${typeCode ?? 'Doc.'} ···${tail}`;
}

/** SC-0130, or null for someone who is not (or is no longer) a member of any sede. */
export function memberCodeOf(
  entry: { memberNumber: number; congregationCode: string } | null,
): string | null {
  return entry
    ? formatMemberCode(entry.congregationCode, entry.memberNumber)
    : null;
}

export interface CategoryTotal {
  category: ContributionCategory;
  amount: number;
  count: number;
}

export interface CategorySummary extends CategoryTotal {
  /** Whole percentage of the total. */
  share: number;
}

/** Per-category totals of the valid contributions: always the four main ones, OTHER only when used. */
export function summarizeByCategory(totals: readonly CategoryTotal[]): {
  summary: CategorySummary[];
  totalAmount: number;
} {
  const byCategory = new Map<
    ContributionCategory,
    { cents: number; count: number }
  >();
  for (const total of totals) {
    const current = byCategory.get(total.category) ?? { cents: 0, count: 0 };
    byCategory.set(total.category, {
      cents: current.cents + toCents(total.amount),
      count: current.count + total.count,
    });
  }
  const totalCents = [...byCategory.values()].reduce(
    (sum, value) => sum + value.cents,
    0,
  );
  const summary = CONTRIBUTION_CATEGORIES.map((category) => {
    const value = byCategory.get(category) ?? { cents: 0, count: 0 };
    return {
      category,
      amount: fromCents(value.cents),
      count: value.count,
      share: totalCents > 0 ? Math.round((value.cents / totalCents) * 100) : 0,
    };
  }).filter(
    (item) => MAIN_CATEGORIES.includes(item.category) || item.count > 0,
  );
  return { summary, totalAmount: fromCents(totalCents) };
}
