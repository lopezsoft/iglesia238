// Fictional accounting fixtures for the demo adapters. Amounts and references are invented.
// Denomination 1 (Monte de Sion) is the main tenant: Sede Central (1) carries the full history
// Jul–Nov 2026; Sede Norte (2), Sede Soacha (3) and denomination 2 have a few rows that prove
// tenant isolation. People are resolved from the shared membership fixtures, never hard-coded.
import { Member } from '../../../core/models/membership.model';
import {
  computeTitheSplit,
  periodFor,
  roundMoney,
  ruleInEffect,
  voucherCode,
  vowPaidAmount,
  vowPledgeStatusFor,
} from './accounting-rules';
import {
  Account,
  AccountNature,
  AccountingPeriod,
  Budget,
  BudgetLine,
  CashDirection,
  CashTransaction,
  Contribution,
  ContributionType,
  Fund,
  FundOpeningBalance,
  PaymentMethod,
  TitheSettlement,
  TitheSettlementRule,
  Voucher,
  VoucherType,
  VOUCHER_TYPES,
  VowPledge,
} from './accounting.models';

/** Every accounting table the demo adapters share. */
export interface AccountingTables {
  readonly funds: Fund[];
  readonly accounts: Account[];
  readonly contributionTypes: ContributionType[];
  readonly fundOpeningBalances: FundOpeningBalance[];
  readonly accountingPeriods: AccountingPeriod[];
  readonly vouchers: Voucher[];
  readonly cashTransactions: CashTransaction[];
  readonly vowPledges: VowPledge[];
  readonly contributions: Contribution[];
  readonly titheSettlementRules: TitheSettlementRule[];
  readonly titheSettlements: TitheSettlement[];
  readonly budgets: Budget[];
  readonly budgetLines: BudgetLine[];
}

/** The demo calendar is anchored to the seed: "today" for defaults and open-period checks. */
export const ACCOUNTING_DEMO_TODAY = '2026-11-02';
export const ACCOUNTING_DEMO_YEAR = 2026;

/** Fund ids used by the seed (and by tests that need a known fund). */
export const DEMO_FUNDS = {
  local: 1,
  missions: 2,
  building: 3,
  women: 4,
  youth: 5,
  camp2025: 6,
  vidaNuevaGeneral: 7,
} as const;

/** Contribution type ids of denomination 1. */
export const DEMO_CONTRIBUTION_TYPES = {
  tithe: 1,
  offering: 2,
  missionOffering: 3,
  firstFruits: 4,
  vow: 5,
  templeOffering2025: 6,
  vidaNuevaTithe: 7,
  vidaNuevaOffering: 8,
} as const;

/** Treasurer (user) who records the movements of each congregation. */
const RECORDER_BY_CONGREGATION: Readonly<Record<number, number>> = { 1: 5, 2: 6, 3: 6, 4: 8, 5: 8 };
/** First receipt number of each congregation, so receipts look like an existing book. */
const FIRST_RECEIPT: Readonly<Record<number, number>> = { 1: 1741, 2: 512, 3: 230, 4: 88 };

const FUNDS: Fund[] = [
  { id: 1, denominationId: 1, name: 'Fondo Local', isActive: true },
  { id: 2, denominationId: 1, name: 'Fondo de Misiones', isActive: true },
  { id: 3, denominationId: 1, name: 'Fondo de Construcción', isActive: true },
  { id: 4, denominationId: 1, name: 'Comité de Damas', isActive: true },
  { id: 5, denominationId: 1, name: 'Comité de Jóvenes', isActive: true },
  { id: 6, denominationId: 1, name: 'Fondo Campamento 2025', isActive: false },
  { id: 7, denominationId: 2, name: 'Fondo General', isActive: true },
];

type AccountSeed = [code: string, name: string, parentCode: string | null, postable: boolean, fundId: number | null];

const DENOMINATION_1_ACCOUNTS: readonly AccountSeed[] = [
  ['4', 'Ingresos', null, false, null],
  ['4105', 'Aportes de los miembros', '4', false, null],
  ['410505', 'Diezmos', '4105', true, 1],
  ['410510', 'Ofrendas', '4105', true, 1],
  ['410515', 'Primicias', '4105', true, 1],
  ['410520', 'Votos', '4105', true, 3],
  ['410525', 'Ofrendas misioneras', '4105', true, 2],
  ['4210', 'Otros ingresos', '4', false, null],
  ['421005', 'Donaciones externas', '4210', true, 1],
  ['421010', 'Rendimientos financieros', '4210', true, 1],
  ['421015', 'Actividades de comités', '4210', true, null],
  ['5', 'Egresos', null, false, null],
  ['5105', 'Gastos de funcionamiento', '5', false, null],
  ['510505', 'Servicios públicos', '5105', true, 1],
  ['510510', 'Honorarios', '5105', true, 1],
  ['510515', 'Aseo y mantenimiento', '5105', true, 1],
  ['510520', 'Papelería y útiles', '5105', true, 1],
  ['5205', 'Obra social y misiones', '5', false, null],
  ['520505', 'Ayudas a familias', '5205', true, 1],
  ['520510', 'Apoyo a misioneros', '5205', true, 2],
  ['5305', 'Aportes a la denominación', '5', false, null],
  ['530505', 'Participación nacional del diezmo', '5305', true, 1],
  ['530510', 'Asignación pastoral', '5305', true, 1],
  ['5405', 'Construcción y mejoras', '5', false, null],
  ['540505', 'Materiales de obra', '5405', true, 3],
  ['540510', 'Mano de obra', '5405', true, 3],
  ['5505', 'Actividades de comités', '5', false, null],
  ['550505', 'Eventos y encuentros', '5505', true, null],
  ['550510', 'Material didáctico', '5505', true, null],
];

const DENOMINATION_2_ACCOUNTS: readonly AccountSeed[] = [
  ['4', 'Ingresos', null, false, null],
  ['4105', 'Aportes de los miembros', '4', false, null],
  ['410505', 'Diezmos', '4105', true, 7],
  ['410510', 'Ofrendas', '4105', true, 7],
  ['5', 'Egresos', null, false, null],
  ['5105', 'Gastos de funcionamiento', '5', false, null],
  ['510505', 'Servicios públicos', '5105', true, 7],
];

function buildAccounts(): Account[] {
  const accounts: Account[] = [];
  const add = (denominationId: number, seeds: readonly AccountSeed[]): void => {
    for (const [code, name, parentCode, isPostable, defaultFundId] of seeds) {
      const parent = parentCode === null ? null : accounts.find((a) => a.denominationId === denominationId && a.code === parentCode);
      const nature: AccountNature = code.startsWith('4') ? 'INCOME' : 'EXPENSE';
      accounts.push({
        id: accounts.length + 1,
        denominationId,
        defaultFundId,
        parentId: parent?.id ?? null,
        code,
        legacyCode: null,
        name,
        nature,
        isPostable,
        isActive: true,
      });
    }
  };
  add(1, DENOMINATION_1_ACCOUNTS);
  add(2, DENOMINATION_2_ACCOUNTS);
  return accounts;
}

const ACCOUNTS = buildAccounts();

function accountId(denominationId: number, code: string): number {
  const account = ACCOUNTS.find((a) => a.denominationId === denominationId && a.code === code);
  if (!account) {
    throw new Error(`Seed account ${code} not found`);
  }
  return account.id;
}

const CONTRIBUTION_TYPES: ContributionType[] = [
  { id: 1, denominationId: 1, category: 'TITHE', code: 'DIEZMO', name: 'Diezmo', accountId: accountId(1, '410505'), isActive: true },
  { id: 2, denominationId: 1, category: 'OFFERING', code: 'OFRENDA', name: 'Ofrenda general', accountId: accountId(1, '410510'), isActive: true },
  { id: 3, denominationId: 1, category: 'OFFERING', code: 'OFRENDA_MISIONERA', name: 'Ofrenda misionera', accountId: accountId(1, '410525'), isActive: true },
  { id: 4, denominationId: 1, category: 'FIRST_FRUITS', code: 'PRIMICIA', name: 'Primicia', accountId: accountId(1, '410515'), isActive: true },
  { id: 5, denominationId: 1, category: 'VOW', code: 'VOTO', name: 'Voto', accountId: accountId(1, '410520'), isActive: true },
  { id: 6, denominationId: 1, category: 'OFFERING', code: 'PRO_TEMPLO_2025', name: 'Ofrenda pro-templo 2025', accountId: accountId(1, '410510'), isActive: false },
  { id: 7, denominationId: 2, category: 'TITHE', code: 'DIEZMO', name: 'Diezmo', accountId: accountId(2, '410505'), isActive: true },
  { id: 8, denominationId: 2, category: 'OFFERING', code: 'OFRENDA', name: 'Ofrenda', accountId: accountId(2, '410510'), isActive: true },
];

const OPENING_BALANCES: FundOpeningBalance[] = [
  { denominationId: 1, congregationId: 1, fundId: 1, year: 2026, amount: 18_450_000 },
  { denominationId: 1, congregationId: 1, fundId: 2, year: 2026, amount: 6_320_000 },
  { denominationId: 1, congregationId: 1, fundId: 3, year: 2026, amount: 42_800_000 },
  { denominationId: 1, congregationId: 1, fundId: 4, year: 2026, amount: 1_250_000 },
  { denominationId: 1, congregationId: 1, fundId: 5, year: 2026, amount: 900_000 },
  { denominationId: 1, congregationId: 2, fundId: 1, year: 2026, amount: 7_200_000 },
  { denominationId: 1, congregationId: 2, fundId: 2, year: 2026, amount: 1_100_000 },
  { denominationId: 1, congregationId: 3, fundId: 1, year: 2026, amount: 3_400_000 },
  { denominationId: 2, congregationId: 4, fundId: 7, year: 2026, amount: 9_800_000 },
];

/** Months 1..11 of 2026 per congregation; months up to `lastClosed` are closed. */
const PERIOD_PLAN: ReadonlyArray<[congregationId: number, denominationId: number, lastClosed: number]> = [
  [1, 1, 10],
  [2, 1, 9],
  [3, 1, 10],
  [4, 2, 10],
  [5, 2, 10],
];

function buildPeriods(): AccountingPeriod[] {
  const periods: AccountingPeriod[] = [];
  for (const [congregationId, denominationId, lastClosed] of PERIOD_PLAN) {
    for (let month = 1; month <= 11; month++) {
      const closed = month <= lastClosed;
      periods.push({
        id: periods.length + 1,
        denominationId,
        congregationId,
        year: 2026,
        month,
        status: closed ? 'CLOSED' : 'OPEN',
        closedAt: closed ? `2026-${String(month + 1).padStart(2, '0')}-01T14:00:00Z` : null,
      });
    }
  }
  return periods;
}

const RULES: TitheSettlementRule[] = [
  { id: 1, denominationId: 1, effectiveFrom: '2025-01-01', nationalShareRate: 0.21, localFundRate: 0.03 },
  { id: 2, denominationId: 1, effectiveFrom: '2026-01-01', nationalShareRate: 0.1, localFundRate: 0.3 },
  { id: 3, denominationId: 2, effectiveFrom: '2026-01-01', nationalShareRate: 0.15, localFundRate: 0.05 },
];

const BUDGETS: Budget[] = [
  { id: 1, denominationId: 1, congregationId: 1, year: 2026, type: 'FIXED', incomeIncreaseRate: 0.05, status: 'APPROVED' },
  { id: 2, denominationId: 1, congregationId: 1, year: 2026, type: 'COMMITTEE', incomeIncreaseRate: null, status: 'APPROVED' },
  { id: 3, denominationId: 1, congregationId: 2, year: 2026, type: 'FIXED', incomeIncreaseRate: null, status: 'DRAFT' },
  { id: 4, denominationId: 2, congregationId: 4, year: 2026, type: 'FIXED', incomeIncreaseRate: null, status: 'APPROVED' },
];

type LineSeed = [budgetId: number, denominationId: number, code: string, fundId: number, monthly: number | null, annual: number];

const BUDGET_LINE_SEEDS: readonly LineSeed[] = [
  // Sede Central · presupuesto fijo
  [1, 1, '410505', 1, 7_500_000, 90_000_000],
  [1, 1, '410510', 1, 3_000_000, 36_000_000],
  [1, 1, '410515', 1, null, 6_000_000],
  [1, 1, '410520', 3, null, 12_000_000],
  [1, 1, '410525', 2, 400_000, 4_800_000],
  [1, 1, '510505', 1, 850_000, 10_200_000],
  [1, 1, '510510', 1, 600_000, 7_200_000],
  [1, 1, '510515', 1, 300_000, 3_600_000],
  [1, 1, '520505', 1, null, 3_000_000],
  [1, 1, '520510', 2, 1_000_000, 12_000_000],
  [1, 1, '530505', 1, null, 9_000_000],
  [1, 1, '530510', 1, 2_000_000, 24_000_000],
  [1, 1, '540505', 3, null, 20_000_000],
  // Sede Central · comités (Damas, Jóvenes, Misiones)
  [2, 1, '550505', 4, null, 1_800_000],
  [2, 1, '550510', 4, null, 400_000],
  [2, 1, '421015', 4, null, 1_200_000],
  [2, 1, '550505', 5, null, 2_400_000],
  [2, 1, '550510', 5, null, 600_000],
  [2, 1, '421015', 5, null, 1_500_000],
  [2, 1, '520510', 2, null, 4_000_000],
  [2, 1, '550505', 2, null, 1_200_000],
  // Sede Norte · borrador
  [3, 1, '410505', 1, 3_000_000, 36_000_000],
  [3, 1, '510505', 1, 450_000, 5_400_000],
  // Vida Nueva Chapinero
  [4, 2, '410505', 7, 4_000_000, 48_000_000],
  [4, 2, '510505', 7, 500_000, 6_000_000],
];

const BUDGET_LINES: BudgetLine[] = BUDGET_LINE_SEEDS.map(([budgetId, denominationId, code, fundId, monthlyAmount, annualAmount], index) => ({
  id: index + 1,
  denominationId,
  budgetId,
  accountId: accountId(denominationId, code),
  fundId,
  monthlyAmount,
  annualAmount,
}));

// --- Movements ---------------------------------------------------------------------------------

interface PledgeSeed {
  readonly id: number;
  readonly congregationId: number;
  /** Index into the active members of the congregation, ordered by member id. */
  readonly slot: number;
  readonly typeId: number;
  readonly description: string | null;
  readonly pledgedAmount: number;
  readonly pledgedOn: string;
}

const PLEDGES: readonly PledgeSeed[] = [
  { id: 1, congregationId: 1, slot: 3, typeId: 5, description: 'Ampliación del templo', pledgedAmount: 1_000_000, pledgedOn: '2026-03-15' },
  { id: 2, congregationId: 1, slot: 4, typeId: 5, description: 'Misiones 2026, abonos mensuales', pledgedAmount: 1_500_000, pledgedOn: '2026-02-01' },
  { id: 3, congregationId: 1, slot: 6, typeId: 5, description: 'Ampliación del templo', pledgedAmount: 600_000, pledgedOn: '2026-05-10' },
  { id: 4, congregationId: 1, slot: 9, typeId: 5, description: 'Compra de sillas para el templo', pledgedAmount: 800_000, pledgedOn: '2026-10-20' },
  { id: 5, congregationId: 2, slot: 0, typeId: 5, description: 'Sonido nuevo para la sede', pledgedAmount: 700_000, pledgedOn: '2026-06-07' },
  { id: 6, congregationId: 4, slot: 0, typeId: 7, description: null, pledgedAmount: 400_000, pledgedOn: '2026-09-13' },
];

interface ContributionSeed {
  readonly congregationId: number;
  readonly on: string;
  readonly typeId: number;
  /** Index into the active members of the congregation; null for anonymous or collections. */
  readonly slot: number | null;
  readonly amount: number;
  readonly method: PaymentMethod;
  readonly reference: string | null;
  readonly pledgeId: number | null;
  readonly notes: string | null;
}

const COLLECTION = 'Colecta del culto dominical 10:00 a. m.';
const MISSION_COLLECTION = 'Ofrenda misionera mensual';

function c(
  congregationId: number,
  on: string,
  typeId: number,
  slot: number | null,
  amount: number,
  method: PaymentMethod = 'CASH',
  reference: string | null = null,
  extra: { pledgeId?: number; notes?: string } = {},
): ContributionSeed {
  return { congregationId, on, typeId, slot, amount, method, reference, pledgeId: extra.pledgeId ?? null, notes: extra.notes ?? null };
}

const T = DEMO_CONTRIBUTION_TYPES;

/**
 * Chronological per congregation, so receipts are consecutive. Contribution 18 is the voided
 * duplicate referenced by the shared audit fixture; September tithes of Sede Central are settled.
 */
const CONTRIBUTIONS: readonly ContributionSeed[] = [
  // Sede Central · julio
  c(1, '2026-07-05', T.tithe, 0, 480_000, 'BANK_TRANSFER', 'TRX 702114'),
  c(1, '2026-07-05', T.offering, null, 620_000, 'CASH', null, { notes: COLLECTION }),
  c(1, '2026-07-19', T.vow, 4, 300_000, 'CASH', null, { pledgeId: 2 }),
  c(1, '2026-07-19', T.tithe, 5, 350_000),
  // agosto
  c(1, '2026-08-02', T.tithe, 1, 420_000, 'BANK_TRANSFER', 'TRX 731905'),
  c(1, '2026-08-02', T.offering, null, 540_000, 'CASH', null, { notes: COLLECTION }),
  c(1, '2026-08-16', T.vow, 4, 300_000, 'CASH', null, { pledgeId: 2 }),
  c(1, '2026-08-16', T.firstFruits, 7, 450_000),
  c(1, '2026-08-30', T.vow, 6, 300_000, 'BANK_DEPOSIT', 'CONS 118842', { pledgeId: 3 }),
  // septiembre (diezmos liquidados)
  c(1, '2026-09-06', T.tithe, 0, 480_000, 'BANK_TRANSFER', 'TRX 760233'),
  c(1, '2026-09-06', T.offering, null, 710_000, 'CASH', null, { notes: COLLECTION }),
  c(1, '2026-09-13', T.tithe, 3, 380_000, 'CARD', 'APR 188421'),
  c(1, '2026-09-13', T.vow, 3, 200_000, 'CARD', 'APR 188422', { pledgeId: 1 }),
  c(1, '2026-09-20', T.tithe, 8, 510_000, 'BANK_TRANSFER', 'TRX 771540'),
  c(1, '2026-09-20', T.tithe, null, 200_000),
  c(1, '2026-09-27', T.tithe, 2, 640_000, 'BANK_TRANSFER', 'TRX 779012'),
  c(1, '2026-09-27', T.missionOffering, null, 385_000, 'CASH', null, { notes: MISSION_COLLECTION }),
  // octubre (periodo cerrado)
  c(1, '2026-10-04', T.tithe, 10, 150_000),
  c(1, '2026-10-04', T.tithe, 10, 150_000),
  c(1, '2026-10-04', T.offering, null, 860_000, 'CASH', null, { notes: COLLECTION }),
  c(1, '2026-10-04', T.tithe, 1, 420_000, 'BANK_TRANSFER', 'TRX 790144'),
  c(1, '2026-10-11', T.tithe, 2, 640_000, 'BANK_TRANSFER', 'TRX 799915'),
  c(1, '2026-10-11', T.vow, 4, 300_000, 'CASH', null, { pledgeId: 2 }),
  c(1, '2026-10-11', T.offering, null, 35_000),
  c(1, '2026-10-11', T.tithe, 11, 290_000),
  c(1, '2026-10-18', T.vow, 3, 200_000, 'CARD', 'APR 198844', { pledgeId: 1 }),
  c(1, '2026-10-18', T.firstFruits, 12, 1_000_000, 'BANK_TRANSFER', 'TRX 805032'),
  c(1, '2026-10-18', T.tithe, 0, 480_000, 'BANK_TRANSFER', 'TRX 805101'),
  c(1, '2026-10-18', T.offering, null, 920_000, 'CASH', null, { notes: COLLECTION }),
  c(1, '2026-10-25', T.tithe, 3, 380_000, 'CARD', 'APR 205318'),
  c(1, '2026-10-25', T.tithe, 13, 260_000),
  c(1, '2026-10-25', T.vow, 6, 300_000, 'BANK_TRANSFER', 'TRX 811207', { pledgeId: 3 }),
  c(1, '2026-10-25', T.offering, null, 1_120_000, 'CASH', null, { notes: COLLECTION }),
  c(1, '2026-10-25', T.missionOffering, null, 410_000, 'CASH', null, { notes: MISSION_COLLECTION }),
  c(1, '2026-10-25', T.tithe, 8, 510_000, 'BANK_TRANSFER', 'TRX 811560'),
  c(1, '2026-10-25', T.tithe, null, 100_000),
  c(1, '2026-10-25', T.offering, 14, 50_000),
  // noviembre (periodo abierto)
  c(1, '2026-11-01', T.tithe, 0, 480_000, 'BANK_TRANSFER', 'TRX 883100'),
  c(1, '2026-11-01', T.tithe, 1, 420_000, 'BANK_TRANSFER', 'TRX 883561'),
  c(1, '2026-11-01', T.tithe, 3, 380_000, 'CARD', 'APR 905318'),
  c(1, '2026-11-01', T.tithe, null, 200_000),
  c(1, '2026-11-01', T.offering, null, 865_000, 'CASH', null, { notes: COLLECTION }),
  c(1, '2026-11-01', T.offering, null, 50_000),
  c(1, '2026-11-01', T.firstFruits, 7, 450_000),
  c(1, '2026-11-01', T.vow, 4, 300_000, 'CASH', null, { pledgeId: 2 }),
  c(1, '2026-11-01', T.tithe, 15, 330_000),
  c(1, '2026-11-01', T.tithe, 16, 270_000, 'BANK_DEPOSIT', 'CONS 230117'),
  c(1, '2026-11-01', T.missionOffering, null, 295_000, 'CASH', null, { notes: MISSION_COLLECTION }),
  c(1, '2026-11-01', T.tithe, 2, 640_000, 'BANK_TRANSFER', 'TRX 883790'),
  c(1, '2026-11-02', T.tithe, 8, 510_000, 'BANK_TRANSFER', 'TRX 884120'),
  c(1, '2026-11-02', T.vow, 3, 150_000, 'BANK_TRANSFER', 'TRX 884097', { pledgeId: 1 }),
  c(1, '2026-11-02', T.offering, 17, 80_000),
  c(1, '2026-11-02', T.tithe, 18, 220_000),
  c(1, '2026-11-02', T.offering, null, 120_000, 'CASH', null, { notes: 'Culto de oración del lunes' }),
  c(1, '2026-11-02', T.tithe, 19, 300_000, 'CARD', 'APR 210044'),
  // Sede Norte
  c(2, '2026-10-25', T.tithe, 0, 350_000),
  c(2, '2026-11-01', T.tithe, 1, 280_000, 'BANK_TRANSFER', 'TRX 600221'),
  c(2, '2026-11-01', T.offering, null, 410_000, 'CASH', null, { notes: COLLECTION }),
  c(2, '2026-11-01', T.vow, 0, 200_000, 'CASH', null, { pledgeId: 5 }),
  // Sede Soacha
  c(3, '2026-11-01', T.tithe, 0, 260_000),
  c(3, '2026-11-01', T.offering, null, 310_000, 'CASH', null, { notes: COLLECTION }),
  // Vida Nueva Chapinero (denominación 2)
  c(4, '2026-11-01', T.vidaNuevaTithe, 0, 300_000),
  c(4, '2026-11-01', T.vidaNuevaOffering, null, 250_000, 'CASH', null, { notes: COLLECTION }),
];

const VOIDED_CONTRIBUTION = {
  id: 18,
  on: '2026-10-29',
  reason: 'Aporte registrado dos veces; se conserva el recibo siguiente.',
} as const;

interface CashEventSeed {
  readonly congregationId: number;
  readonly on: string;
  readonly direction: CashDirection;
  readonly code: string;
  readonly fundId: number;
  readonly amount: number;
  readonly description: string;
}

function monthly(
  congregationId: number,
  day: string,
  months: readonly string[],
  code: string,
  fundId: number,
  amount: number,
  description: string,
  direction: CashDirection = 'OUT',
): CashEventSeed[] {
  return months.map((month) => ({
    congregationId,
    on: `2026-${month}-${day}`,
    direction,
    code,
    fundId,
    amount,
    description,
  }));
}

const JUL_OCT = ['07', '08', '09', '10'];

const CASH_EVENTS: readonly CashEventSeed[] = [
  ...monthly(1, '06', JUL_OCT, '510505', 1, 820_000, 'Energía, acueducto e internet del templo'),
  ...monthly(1, '10', JUL_OCT, '510510', 1, 600_000, 'Honorarios del contador'),
  ...monthly(1, '15', JUL_OCT, '510515', 1, 300_000, 'Aseo y mantenimiento del templo'),
  ...monthly(1, '20', JUL_OCT, '520510', 2, 1_000_000, 'Apoyo mensual a la misión en La Guajira'),
  ...monthly(1, '28', JUL_OCT, '421010', 1, 18_500, 'Rendimientos de la cuenta de ahorros', 'IN'),
  { congregationId: 1, on: '2026-08-08', direction: 'OUT', code: '550505', fundId: 4, amount: 380_000, description: 'Encuentro de damas: refrigerios' },
  { congregationId: 1, on: '2026-08-22', direction: 'OUT', code: '540505', fundId: 3, amount: 3_450_000, description: 'Cemento, bloque y varilla para la ampliación' },
  { congregationId: 1, on: '2026-09-12', direction: 'OUT', code: '520505', fundId: 1, amount: 450_000, description: 'Mercados para familias de la sede' },
  { congregationId: 1, on: '2026-09-15', direction: 'IN', code: '421005', fundId: 3, amount: 2_000_000, description: 'Donación de una empresa para la ampliación' },
  { congregationId: 1, on: '2026-10-03', direction: 'OUT', code: '550505', fundId: 5, amount: 520_000, description: 'Retiro de jóvenes: transporte' },
  { congregationId: 1, on: '2026-10-14', direction: 'OUT', code: '540510', fundId: 3, amount: 2_800_000, description: 'Mano de obra de la ampliación, primer corte' },
  { congregationId: 1, on: '2026-11-02', direction: 'OUT', code: '510520', fundId: 1, amount: 85_000, description: 'Papelería para la secretaría' },
  { congregationId: 2, on: '2026-10-06', direction: 'OUT', code: '510505', fundId: 1, amount: 410_000, description: 'Servicios públicos de la sede' },
  { congregationId: 2, on: '2026-11-02', direction: 'OUT', code: '510515', fundId: 1, amount: 150_000, description: 'Aseo de la sede' },
  { congregationId: 4, on: '2026-10-06', direction: 'OUT', code: '510505', fundId: 7, amount: 380_000, description: 'Servicios públicos' },
];

/** Builds the seed with consistent ids, receipts, cash lines, reversals and the settlement. */
class SeedBuilder {
  readonly periods = buildPeriods();
  readonly vouchers: Voucher[] = [];
  readonly transactions: CashTransaction[] = [];
  readonly contributions: Contribution[] = [];
  readonly pledges: VowPledge[] = [];
  readonly settlements: TitheSettlement[] = [];
  private readonly members: readonly Member[];

  constructor(members: readonly Member[]) {
    this.members = members;
  }

  build(): AccountingTables {
    this.addPledges();
    this.addContributions();
    this.voidDuplicate();
    this.addCashEvents();
    this.settleSeptember();
    this.refreshPledgeStatuses();
    return {
      funds: structuredClone(FUNDS),
      accounts: structuredClone(ACCOUNTS),
      contributionTypes: structuredClone(CONTRIBUTION_TYPES),
      fundOpeningBalances: structuredClone(OPENING_BALANCES),
      accountingPeriods: this.periods,
      vouchers: this.vouchers,
      cashTransactions: this.transactions,
      vowPledges: this.pledges,
      contributions: this.contributions,
      titheSettlementRules: structuredClone(RULES),
      titheSettlements: this.settlements,
      budgets: structuredClone(BUDGETS),
      budgetLines: structuredClone(BUDGET_LINES),
    };
  }

  private personAt(congregationId: number, slot: number): number {
    const people = this.members
      .filter((m) => m.congregationId === congregationId && m.status === 'ACTIVE')
      .sort((a, b) => a.id - b.id)
      .map((m) => m.personId);
    const personId = people[slot];
    if (personId === undefined) {
      throw new Error(`Seed member slot ${slot} missing in congregation ${congregationId}`);
    }
    return personId;
  }

  private denominationOf(congregationId: number): number {
    return congregationId >= 4 ? 2 : 1;
  }

  private voucher(congregationId: number, type: VoucherType, issuedOn: string, signerId: number | null = null): Voucher {
    const last = this.vouchers
      .filter((v) => v.congregationId === congregationId && v.type === type)
      .reduce((max, v) => Math.max(max, v.number), 0);
    const first = type === VOUCHER_TYPES.receipt ? (FIRST_RECEIPT[congregationId] ?? 1) : 1;
    const voucher: Voucher = {
      id: this.vouchers.length + 1,
      denominationId: this.denominationOf(congregationId),
      congregationId,
      type,
      number: last === 0 ? first : last + 1,
      issuedOn,
      signerId,
      voidedAt: null,
      voidReason: null,
    };
    this.vouchers.push(voucher);
    return voucher;
  }

  private post(
    tx: Omit<CashTransaction, 'id' | 'periodId' | 'createdAt' | 'denominationId' | 'reversalOfId'> & {
      reversalOfId?: number;
    },
  ): CashTransaction {
    const period = periodFor(this.periods, tx.congregationId, tx.postedOn);
    if (!period) {
      throw new Error(`Seed period missing for ${tx.postedOn}`);
    }
    const row: CashTransaction = {
      ...tx,
      id: this.transactions.length + 1,
      denominationId: this.denominationOf(tx.congregationId),
      periodId: period.id,
      reversalOfId: tx.reversalOfId ?? null,
      createdAt: `${tx.postedOn}T16:00:00Z`,
    };
    this.transactions.push(row);
    return row;
  }

  private addPledges(): void {
    for (const seed of PLEDGES) {
      this.pledges.push({
        id: seed.id,
        denominationId: this.denominationOf(seed.congregationId),
        congregationId: seed.congregationId,
        personId: this.personAt(seed.congregationId, seed.slot),
        contributionTypeId: seed.typeId,
        description: seed.description,
        pledgedAmount: seed.pledgedAmount,
        pledgedOn: seed.pledgedOn,
        dueOn: null,
        status: 'ACTIVE',
        createdAt: `${seed.pledgedOn}T15:00:00Z`,
      });
    }
  }

  private addContributions(): void {
    for (const seed of CONTRIBUTIONS) {
      const type = CONTRIBUTION_TYPES.find((t) => t.id === seed.typeId)!;
      const account = ACCOUNTS.find((a) => a.id === type.accountId)!;
      const recorder = RECORDER_BY_CONGREGATION[seed.congregationId] ?? 5;
      const receipt = this.voucher(seed.congregationId, VOUCHER_TYPES.receipt, seed.on);
      const tx = this.post({
        congregationId: seed.congregationId,
        accountId: account.id,
        fundId: account.defaultFundId ?? FUNDS.find((f) => f.denominationId === type.denominationId)!.id,
        voucherId: receipt.id,
        direction: 'IN',
        postedOn: seed.on,
        amount: seed.amount,
        description: `${type.name} · ${voucherCode(receipt.type, receipt.number, receipt.issuedOn)}`,
        createdById: recorder,
      });
      this.contributions.push({
        id: this.contributions.length + 1,
        denominationId: type.denominationId,
        congregationId: seed.congregationId,
        contributionTypeId: type.id,
        personId: seed.slot === null ? null : this.personAt(seed.congregationId, seed.slot),
        vowPledgeId: seed.pledgeId,
        cashTransactionId: tx.id,
        voucherId: receipt.id,
        titheSettlementId: null,
        receivedOn: seed.on,
        amount: seed.amount,
        paymentMethod: seed.method,
        paymentReference: seed.reference,
        notes: seed.notes,
        status: 'RECORDED',
        recordedById: recorder,
        voidedById: null,
        voidedAt: null,
        voidReason: null,
        createdAt: `${seed.on}T15:30:00Z`,
      });
    }
  }

  private voidDuplicate(): void {
    const index = this.contributions.findIndex((row) => row.id === VOIDED_CONTRIBUTION.id);
    const target = this.contributions[index];
    const voidedAt = `${VOIDED_CONTRIBUTION.on}T20:10:00Z`;
    this.contributions[index] = {
      ...target,
      status: 'VOIDED',
      voidedById: target.recordedById,
      voidedAt,
      voidReason: VOIDED_CONTRIBUTION.reason,
    };
    const voucherIndex = this.vouchers.findIndex((v) => v.id === target.voucherId);
    this.vouchers[voucherIndex] = { ...this.vouchers[voucherIndex], voidedAt, voidReason: VOIDED_CONTRIBUTION.reason };
    const original = this.transactions.find((tx) => tx.id === target.cashTransactionId)!;
    this.post({
      congregationId: original.congregationId,
      accountId: original.accountId,
      fundId: original.fundId,
      voucherId: null,
      direction: 'OUT',
      postedOn: VOIDED_CONTRIBUTION.on,
      amount: original.amount,
      description: `Reversa por anulación · ${original.description}`,
      createdById: target.recordedById,
      reversalOfId: original.id,
    });
  }

  private addCashEvents(): void {
    const events = [...CASH_EVENTS].sort((a, b) => a.on.localeCompare(b.on));
    for (const event of events) {
      const voucher = this.voucher(
        event.congregationId,
        event.direction === 'IN' ? VOUCHER_TYPES.cashIn : VOUCHER_TYPES.cashOut,
        event.on,
      );
      this.post({
        congregationId: event.congregationId,
        accountId: accountId(this.denominationOf(event.congregationId), event.code),
        fundId: event.fundId,
        voucherId: voucher.id,
        direction: event.direction,
        postedOn: event.on,
        amount: event.amount,
        description: event.description,
        createdById: RECORDER_BY_CONGREGATION[event.congregationId] ?? 5,
      });
    }
  }

  /** Settlement of September 2026 for Sede Central, issued on 5 October. */
  private settleSeptember(): void {
    const settledOn = '2026-10-05';
    const tithes = this.contributions.filter(
      (row) =>
        row.congregationId === 1 &&
        row.contributionTypeId === DEMO_CONTRIBUTION_TYPES.tithe &&
        row.status === 'RECORDED' &&
        row.receivedOn >= '2026-09-01' &&
        row.receivedOn <= '2026-09-30',
    );
    const grossTithe = roundMoney(tithes.reduce((sum, row) => sum + row.amount, 0));
    const rule = ruleInEffect(RULES, 1, settledOn)!;
    const split = computeTitheSplit(grossTithe, rule);
    const voucher = this.voucher(1, VOUCHER_TYPES.titheSettlement, settledOn, this.personAt(1, 2));
    const settlement: TitheSettlement = {
      id: 1,
      denominationId: 1,
      congregationId: 1,
      voucherId: voucher.id,
      pastorId: this.personAt(1, 0),
      settledOn,
      coveredFrom: '2026-09-01',
      coveredTo: '2026-09-30',
      grossTithe,
      nationalShareRate: rule.nationalShareRate,
      localFundRate: rule.localFundRate,
      ...split,
      status: 'ISSUED',
      voidedById: null,
      voidedAt: null,
      voidReason: null,
      createdAt: `${settledOn}T17:00:00Z`,
    };
    this.settlements.push(settlement);
    for (const tithe of tithes) {
      const index = this.contributions.indexOf(tithe);
      this.contributions[index] = { ...tithe, titheSettlementId: settlement.id };
    }
    const code = voucherCode(voucher.type, voucher.number, voucher.issuedOn);
    const recorder = RECORDER_BY_CONGREGATION[1];
    this.post({
      congregationId: 1,
      accountId: accountId(1, '530505'),
      fundId: DEMO_FUNDS.local,
      voucherId: voucher.id,
      direction: 'OUT',
      postedOn: settledOn,
      amount: split.nationalShare,
      description: `Participación nacional del diezmo de septiembre · ${code}`,
      createdById: recorder,
    });
    this.post({
      congregationId: 1,
      accountId: accountId(1, '530510'),
      fundId: DEMO_FUNDS.local,
      voucherId: voucher.id,
      direction: 'OUT',
      postedOn: settledOn,
      amount: split.pastorNet,
      description: `Asignación pastoral de septiembre · ${code}`,
      createdById: recorder,
    });
  }

  private refreshPledgeStatuses(): void {
    for (let i = 0; i < this.pledges.length; i++) {
      const pledge = this.pledges[i];
      this.pledges[i] = { ...pledge, status: vowPledgeStatusFor(pledge, vowPaidAmount(this.contributions, pledge.id)) };
    }
  }
}

/** Fresh copy of every accounting table, resolving people from the membership fixtures. */
export function buildAccountingSeed(members: readonly Member[]): AccountingTables {
  return new SeedBuilder(members).build();
}
