import {
  BusinessRuleException,
  ConflictDomainException,
  InvalidInputException,
} from '../../../common/errors/domain.exception.js';
import { toCents } from '../../../common/accounting/accounting-rules.js';
import type { ContributionCategory } from './contribution.types.js';

export const ContributionErrorCode = {
  VOW_REQUIRES_PERSON: 'VOW_REQUIRES_PERSON',
  VOW_PLEDGE_REQUIRED: 'VOW_PLEDGE_REQUIRED',
  VOW_PLEDGE_NOT_ALLOWED: 'VOW_PLEDGE_NOT_ALLOWED',
  VOW_PLEDGE_MISMATCH: 'VOW_PLEDGE_MISMATCH',
  VOW_PLEDGE_CLOSED: 'VOW_PLEDGE_CLOSED',
  VOW_PAYMENT_EXCEEDS_BALANCE: 'VOW_PAYMENT_EXCEEDS_BALANCE',
} as const;

const PESOS = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

/** "$ 450.000" for messages. */
export function formatPesos(amount: number): string {
  return PESOS.format(amount);
}

/**
 * Shape rules of a vow payment that do not need the pledge: only VOW contributions point to a
 * pledge, and a VOW contribution needs a named contributor and the pledge it pays.
 */
export function assertVowShape(input: {
  category: ContributionCategory;
  personId: number | null;
  vowPledgeId: number | null;
}): void {
  if (input.category !== 'VOW') {
    if (input.vowPledgeId !== null) {
      throw new InvalidInputException(
        'Solo los aportes de tipo Voto se asocian a una promesa.',
        ContributionErrorCode.VOW_PLEDGE_NOT_ALLOWED,
      );
    }
    return;
  }
  if (input.personId === null) {
    throw new InvalidInputException(
      'Los abonos a votos requieren un aportante nominal.',
      ContributionErrorCode.VOW_REQUIRES_PERSON,
    );
  }
  if (input.vowPledgeId === null) {
    throw new InvalidInputException(
      'Selecciona la promesa de voto a la que se abona.',
      ContributionErrorCode.VOW_PLEDGE_REQUIRED,
    );
  }
}

/**
 * A payment goes to a pledge of the same person and type that is still open, within its balance.
 * `pledge` is read under lock, so two payments in a row cannot both fit the same balance.
 */
export function assertPledgePayable(
  pledge: {
    personId: number;
    contributionTypeId: number;
    pledgedAmount: number;
    status: string;
    paid: number;
  } | null,
  payment: {
    personId: number | null;
    contributionTypeId: number;
    amount: number;
  },
): void {
  if (
    !pledge ||
    pledge.personId !== payment.personId ||
    pledge.contributionTypeId !== payment.contributionTypeId
  ) {
    throw new BusinessRuleException(
      'La promesa no corresponde a la misma persona y al mismo tipo de aporte.',
      ContributionErrorCode.VOW_PLEDGE_MISMATCH,
    );
  }
  const balanceCents = toCents(pledge.pledgedAmount) - toCents(pledge.paid);
  if (pledge.status !== 'ACTIVE' || balanceCents <= 0) {
    throw new ConflictDomainException(
      'La promesa ya está cumplida o cancelada: no admite abonos.',
      ContributionErrorCode.VOW_PLEDGE_CLOSED,
    );
  }
  if (toCents(payment.amount) > balanceCents) {
    throw new ConflictDomainException(
      `El abono supera el saldo pendiente de la promesa (${formatPesos(balanceCents / 100)}).`,
      ContributionErrorCode.VOW_PAYMENT_EXCEEDS_BALANCE,
    );
  }
}
