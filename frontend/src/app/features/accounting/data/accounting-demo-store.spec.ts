import { TestBed } from '@angular/core/testing';
import { DemoDatabase } from '../../../core/demo/demo-database';
import { DomainError } from '../../../core/errors/domain-error';
import { DEMO_FUNDS } from './accounting-demo-seed';
import { AccountingDemoStore } from './accounting-demo-store';
import {
  accountHasChildren,
  computeTitheSplit,
  contributionDisplayStatus,
  fundBalance,
  periodFor,
  postableAccounts,
  ruleInEffect,
  vowPledgeStatusFor,
} from './accounting-rules';

function setup(): { store: AccountingDemoStore; db: DemoDatabase } {
  TestBed.configureTestingModule({});
  return { store: TestBed.inject(AccountingDemoStore), db: TestBed.inject(DemoDatabase) };
}

function thrown(action: () => unknown): DomainError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(DomainError);
    return error as DomainError;
  }
  throw new Error('Expected a DomainError');
}

describe('AccountingDemoStore seed invariants', () => {
  it('posts movements only on postable accounts and funds of the same denomination', () => {
    const { store } = setup();
    for (const tx of store.cashTransactions) {
      const account = store.account(tx.denominationId, tx.accountId);
      expect(account?.isPostable, `tx ${tx.id}`).toBe(true);
      expect(store.fund(tx.denominationId, tx.fundId), `tx ${tx.id}`).toBeDefined();
      expect(tx.amount).toBeGreaterThan(0);
    }
  });

  it('never makes a parent account postable and links every contribution type to a postable income account', () => {
    const { store } = setup();
    for (const account of store.accounts) {
      if (accountHasChildren(store.accounts, account.id)) {
        expect(account.isPostable, account.code).toBe(false);
      }
    }
    for (const type of store.contributionTypes) {
      const account = store.account(type.denominationId, type.accountId);
      expect(account?.isPostable && account.nature === 'INCOME', type.code).toBe(true);
    }
  });

  it('places every cash line inside the period of its congregation and date', () => {
    const { store } = setup();
    for (const tx of store.cashTransactions) {
      const period = store.accountingPeriods.find((p) => p.id === tx.periodId);
      expect(period?.congregationId).toBe(tx.congregationId);
      expect(periodFor(store.accountingPeriods, tx.congregationId, tx.postedOn)?.id).toBe(tx.periodId);
    }
  });

  it('closes October and keeps November open in Sede Central', () => {
    const { store } = setup();
    expect(store.periodFor(1, '2026-10-15')?.status).toBe('CLOSED');
    expect(store.periodFor(1, '2026-10-15')?.id).toBe(10);
    expect(store.periodFor(1, '2026-11-02')?.status).toBe('OPEN');
    expect(thrown(() => store.requireOpenPeriod(1, '2026-10-04')).code).toBe('PERIOD_CLOSED');
    expect(thrown(() => store.requireOpenPeriod(1, '2025-12-31')).code).toBe('PERIOD_NOT_FOUND');
  });

  it('backs each contribution with its receipt and an IN cash line of the same amount', () => {
    const { store } = setup();
    for (const c of store.contributions) {
      const tx = store.cashTransactions.find((t) => t.id === c.cashTransactionId);
      expect(tx?.direction).toBe('IN');
      expect(tx?.amount).toBe(c.amount);
      expect(tx?.congregationId).toBe(c.congregationId);
      expect(store.voucher(c.voucherId)?.type).toBe('REC');
    }
  });

  it('numbers receipts consecutively per congregation in date order', () => {
    const { store } = setup();
    for (const congregationId of [1, 2, 3, 4]) {
      const receipts = store.contributions
        .filter((c) => c.congregationId === congregationId)
        .map((c) => store.voucher(c.voucherId)!);
      receipts.forEach((voucher, index) => {
        if (index > 0) {
          expect(voucher.number).toBe(receipts[index - 1].number + 1);
          expect(voucher.issuedOn >= receipts[index - 1].issuedOn).toBe(true);
        }
      });
    }
  });

  it('keeps the voided duplicate of the audit fixture with its reversal', () => {
    const { store } = setup();
    const voided = store.contributions.find((c) => c.id === 18)!;
    expect(voided.status).toBe('VOIDED');
    expect(voided.amount).toBe(150_000);
    expect(voided.voidReason).toBeTruthy();
    const reversal = store.cashTransactions.find((tx) => tx.reversalOfId === voided.cashTransactionId);
    expect(reversal?.direction).toBe('OUT');
    expect(reversal?.amount).toBe(150_000);
    expect(store.voucher(voided.voucherId)?.voidedAt).not.toBeNull();
  });

  it('settles exactly the September tithes of Sede Central with the rule in force', () => {
    const { store } = setup();
    const settlement = store.titheSettlements[0];
    const settled = store.contributions.filter((c) => c.titheSettlementId === settlement.id);
    expect(settlement.status).toBe('ISSUED');
    expect(settled.length).toBeGreaterThan(0);
    for (const c of settled) {
      expect(store.contributionType(1, c.contributionTypeId)?.category).toBe('TITHE');
      expect(c.receivedOn >= settlement.coveredFrom && c.receivedOn <= settlement.coveredTo).toBe(true);
      expect(contributionDisplayStatus(c)).toBe('SETTLED');
    }
    const gross = settled.reduce((sum, c) => sum + c.amount, 0);
    expect(settlement.grossTithe).toBe(gross);
    const rule = ruleInEffect(store.titheSettlementRules, 1, settlement.settledOn)!;
    expect(rule.nationalShareRate).toBe(0.1);
    expect(computeTitheSplit(gross, rule)).toEqual({
      nationalShare: settlement.nationalShare,
      localFundShare: settlement.localFundShare,
      pastorNet: settlement.pastorNet,
    });
  });

  it('pays every vow with contributions of the same person and type, and computes the status', () => {
    const { store } = setup();
    for (const c of store.contributions.filter((row) => row.vowPledgeId !== null)) {
      const pledge = store.vowPledges.find((p) => p.id === c.vowPledgeId)!;
      expect(c.personId).toBe(pledge.personId);
      expect(c.contributionTypeId).toBe(pledge.contributionTypeId);
    }
    expect(store.vowPaid(1)).toBe(550_000);
    expect(store.vowPledges.find((p) => p.id === 1)?.status).toBe('ACTIVE');
    expect(store.vowPaid(3)).toBe(600_000);
    expect(store.vowPledges.find((p) => p.id === 3)?.status).toBe('FULFILLED');
    expect(vowPledgeStatusFor({ status: 'CANCELLED', pledgedAmount: 100 }, 100)).toBe('CANCELLED');
  });

  it('takes nominal contributors from the members of the same denomination', () => {
    const { store, db } = setup();
    for (const c of store.contributions.filter((row) => row.personId !== null)) {
      expect(db.person(c.personId!)?.denominationId).toBe(c.denominationId);
    }
  });

  it('keeps rows of denomination 2 apart from denomination 1', () => {
    const { store } = setup();
    for (const table of [store.funds, store.accounts, store.contributionTypes, store.contributions, store.budgets]) {
      expect(table.some((row) => row.denominationId === 2)).toBe(true);
    }
    for (const c of store.contributions.filter((row) => row.denominationId === 2)) {
      expect(store.contributionType(2, c.contributionTypeId)).toBeDefined();
      expect(c.congregationId).toBeGreaterThanOrEqual(4);
    }
  });
});

describe('Accounting helpers and posting rules', () => {
  it('lists only postable accounts and computes fund balances per month', () => {
    const { store } = setup();
    const postable = postableAccounts(store.accounts, 1, 'INCOME');
    expect(postable.every((a) => a.isPostable && a.nature === 'INCOME' && a.denominationId === 1)).toBe(true);
    expect(postable.some((a) => a.code === '4105')).toBe(false);

    const november = fundBalance(store.fundOpeningBalances, store.cashTransactions, 1, DEMO_FUNDS.local, { year: 2026, month: 11 });
    const october = fundBalance(store.fundOpeningBalances, store.cashTransactions, 1, DEMO_FUNDS.local, { year: 2026, month: 10 });
    expect(november.opening).toBe(october.closing);
    expect(november.closing).toBe(november.opening + november.income - november.expense);
    expect(store.fundBalance(1, DEMO_FUNDS.local, { year: 2026, month: 11 })).toEqual(november);
  });

  it('rejects movements on groups, in closed periods or without amount', () => {
    const { store } = setup();
    const base = {
      denominationId: 1,
      congregationId: 1,
      accountId: store.accounts.find((a) => a.denominationId === 1 && a.code === '510505')!.id,
      fundId: DEMO_FUNDS.local,
      voucherId: null,
      direction: 'OUT' as const,
      postedOn: '2026-11-02',
      amount: 1000,
      description: 'Prueba',
      createdById: 5,
    };
    const group = store.accounts.find((a) => a.denominationId === 1 && a.code === '5105')!;
    expect(thrown(() => store.postCashTransaction({ ...base, accountId: group.id })).code).toBe('ACCOUNT_NOT_POSTABLE');
    expect(thrown(() => store.postCashTransaction({ ...base, postedOn: '2026-10-20' })).code).toBe('PERIOD_CLOSED');
    expect(thrown(() => store.postCashTransaction({ ...base, amount: 0 })).code).toBe('INVALID_AMOUNT');
    expect(thrown(() => store.postCashTransaction({ ...base, denominationId: 2 })).code).toBe('ACCOUNT_NOT_POSTABLE');

    const posted = store.postCashTransaction(base);
    expect(posted.periodId).toBe(11);
    const reversal = store.reverseCashTransaction({ transactionId: posted.id, postedOn: '2026-11-02', createdById: 5, description: 'Reversa' });
    expect(reversal.direction).toBe('IN');
    expect(thrown(() => store.reverseCashTransaction({ transactionId: posted.id, postedOn: '2026-11-02', createdById: 5, description: 'x' })).code).toBe('ALREADY_REVERSED');
  });

  it('issues consecutive vouchers per congregation and type', () => {
    const { store } = setup();
    const next = store.nextVoucherNumber(1, 'CE');
    const voucher = store.issueVoucher({ denominationId: 1, congregationId: 1, type: 'CE', issuedOn: '2026-11-02' });
    expect(voucher.number).toBe(next);
    expect(store.voucherCode(voucher.id)).toBe(`CE-2026-${String(next).padStart(5, '0')}`);
  });
});
