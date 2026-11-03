import type {
  ContributionCategory,
  ContributionDisplayStatus,
  PaymentMethod,
} from './contribution.types.js';

/** Spanish labels for the exports (the screens have their own copy in the frontend). */
export const CONTRIBUTION_CATEGORY_LABELS: Readonly<
  Record<ContributionCategory, string>
> = {
  TITHE: 'Diezmo',
  OFFERING: 'Ofrenda',
  FIRST_FRUITS: 'Primicia',
  VOW: 'Voto',
  OTHER: 'Otro',
};

export const PAYMENT_METHOD_LABELS: Readonly<Record<PaymentMethod, string>> = {
  CASH: 'Efectivo',
  BANK_TRANSFER: 'Transferencia',
  CARD: 'Datáfono',
  BANK_DEPOSIT: 'Consignación',
  OTHER: 'Otro',
};

export const CONTRIBUTION_STATUS_LABELS: Readonly<
  Record<ContributionDisplayStatus, string>
> = {
  RECORDED: 'Registrado',
  SETTLED: 'Liquidado',
  VOIDED: 'Anulado',
};
