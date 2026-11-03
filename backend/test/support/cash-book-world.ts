import { DocumentNumberingService } from '../../src/common/numbering/document-numbering.service.js';
import { CashBookQueryService } from '../../src/modules/cash-book/application/cash-book-query.service.js';
import { CashMovementsService } from '../../src/modules/cash-book/application/cash-movements.service.js';
import { ConsolidationService } from '../../src/modules/cash-book/application/consolidation.service.js';
import { PeriodCloseService } from '../../src/modules/cash-book/application/period-close.service.js';
import { VouchersService } from '../../src/modules/cash-book/application/vouchers.service.js';
import {
  FakeAuditRecorder,
  FakeTransactionRunner,
  FixedClock,
  contextFor,
} from './accounting-doubles.js';
import { FakeCongregationLookup } from './accounting-setup-fakes.js';
import { FakeSequenceStore, InMemoryCashBook } from './cash-book-fakes.js';
import { TENANT_A } from './tenants.js';

export const CASH_PERMISSIONS = ['cash-transactions.write'];

/**
 * A small set of books for the cash-book tests: one denomination with a sede, the local fund, an expense
 * and an income account, a closed October and an open November, with today being November 2, 2026.
 */
export function buildCashBookWorld(today = '2026-11-02') {
  const sequences = new FakeSequenceStore();
  const runner = new FakeTransactionRunner();
  const book = new InMemoryCashBook(sequences);
  const audit = new FakeAuditRecorder();
  const clock = FixedClock.at(today);
  const numbering = new DocumentNumberingService(sequences, runner);
  const lookup = new FakeCongregationLookup(new Map([[10, 'Sede Central']]));

  const local = book.addFund(1, 'Fondo Local');
  const missions = book.addFund(1, 'Misiones');
  const expense = book.addAccount(1, '510505', { nature: 'EXPENSE' });
  const tithes = book.addAccount(1, '410505', {
    nature: 'INCOME',
    defaultFundId: local.id,
  });
  const offerings = book.addAccount(1, '410510', {
    nature: 'INCOME',
    defaultFundId: local.id,
  });
  const missionsIncome = book.addAccount(1, '410525', {
    nature: 'INCOME',
    defaultFundId: missions.id,
  });
  const october = book.addPeriod(TENANT_A, 2026, 10, 'CLOSED');
  const november = book.addPeriod(TENANT_A, 2026, 11);
  book.setOpening(TENANT_A, local.id, 2026, 18_450_000);

  return {
    sequences,
    book,
    audit,
    clock,
    treasurer: contextFor(TENANT_A, CASH_PERMISSIONS),
    ids: {
      local: local.id,
      missions: missions.id,
      expense: expense.id,
      tithes: tithes.id,
      offerings: offerings.id,
      missionsIncome: missionsIncome.id,
      october: october.id,
      november: november.id,
    },
    movements: new CashMovementsService(book, numbering, runner, audit, clock),
    consolidation: new ConsolidationService(
      book,
      numbering,
      runner,
      audit,
      clock,
    ),
    closing: new PeriodCloseService(book, runner, audit, clock),
    queries: new CashBookQueryService(book, lookup, clock),
    vouchers: new VouchersService(book),
  };
}

export type CashBookWorld = ReturnType<typeof buildCashBookWorld>;

export async function codeOf(promise: Promise<unknown>): Promise<string> {
  const error = (await promise.then(
    () => null,
    (e: unknown) => e,
  )) as { code?: string } | null;
  return error?.code ?? 'NO_ERROR';
}
