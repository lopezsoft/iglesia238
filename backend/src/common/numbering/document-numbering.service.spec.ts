import { Transaction, TransactionRunner } from '../persistence/transaction.js';
import { TenantScope } from '../tenancy/tenant-scope.js';
import {
  DocumentNumberingService,
  SequenceKeys,
  formatCertificateCode,
  formatMemberCode,
  formatVoucherCode,
} from './document-numbering.service.js';
import { DocumentSequenceStore } from './document-sequence.store.js';

const CONGREGATION = TenantScope.of(1, 10);
const OTHER_CONGREGATION = TenantScope.of(1, 11);
const OTHER_DENOMINATION = TenantScope.of(2, 10);

/** Counters per (denomination, congregation, key), like the DocumentSequence table. */
class FakeSequenceStore implements DocumentSequenceStore {
  readonly counters = new Map<string, number>();
  readonly seenTransactions: Transaction[] = [];

  next(scope: TenantScope, key: string, transaction: Transaction) {
    this.seenTransactions.push(transaction);
    const id = `${scope.denominationId}/${scope.congregationId}/${key}`;
    const value = (this.counters.get(id) ?? 0) + 1;
    this.counters.set(id, value);
    return Promise.resolve(value);
  }
}

class FakeTransactionRunner implements TransactionRunner {
  readonly handle: Transaction = { kind: 'transaction' };
  runs = 0;

  run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    this.runs += 1;
    return work(this.handle);
  }
}

function setup() {
  const store = new FakeSequenceStore();
  const runner = new FakeTransactionRunner();
  return {
    store,
    runner,
    service: new DocumentNumberingService(store, runner),
  };
}

describe('DocumentNumberingService', () => {
  it('numbers members consecutively per congregation', async () => {
    const { service } = setup();

    expect(await service.nextMemberNumber(CONGREGATION)).toBe(1);
    expect(await service.nextMemberNumber(CONGREGATION)).toBe(2);
    expect(await service.nextMemberNumber(OTHER_CONGREGATION)).toBe(1);
  });

  it('keeps denominations apart even with the same congregation id', async () => {
    const { service } = setup();
    await service.nextMemberNumber(CONGREGATION);

    expect(await service.nextMemberNumber(OTHER_DENOMINATION)).toBe(1);
  });

  it('keeps one counter per kind of document', async () => {
    const { service, store } = setup();

    await service.nextMemberNumber(CONGREGATION);
    await service.nextVoucherNumber(CONGREGATION, 'REC');
    await service.nextVoucherNumber(CONGREGATION, 'REC');
    await service.nextVoucherNumber(CONGREGATION, 'CE');
    await service.nextCertificateNumber(CONGREGATION, 'MEM');

    expect([...store.counters.entries()]).toEqual([
      ['1/10/MEMBER', 1],
      ['1/10/VOUCHER:REC', 2],
      ['1/10/VOUCHER:CE', 1],
      ['1/10/CERT:MEM', 1],
    ]);
  });

  it('does not restart when the year changes: the year is only formatting', async () => {
    const { service } = setup();
    await service.nextVoucherNumber(CONGREGATION, 'REC');
    await service.nextVoucherNumber(CONGREGATION, 'REC');

    const first2027 = await service.nextVoucherNumber(CONGREGATION, 'REC');

    expect(first2027).toBe(3);
    expect(formatVoucherCode('REC', '2027-01-02', first2027)).toBe(
      'REC-2027-00003',
    );
  });

  it('joins the transaction of the caller', async () => {
    const { service, store, runner } = setup();
    const outer: Transaction = { kind: 'transaction' };

    await service.nextMemberNumber(CONGREGATION, outer);

    expect(store.seenTransactions).toEqual([outer]);
    expect(runner.runs).toBe(0);
  });

  it('opens its own transaction when the caller has none', async () => {
    const { service, store, runner } = setup();

    await service.nextMemberNumber(CONGREGATION);

    expect(runner.runs).toBe(1);
    expect(store.seenTransactions).toEqual([runner.handle]);
  });

  it('requires a congregation: numbers belong to one', () => {
    const { service } = setup();

    expect(() => service.nextMemberNumber(TenantScope.of(1))).toThrow(
      'congregation scope',
    );
  });

  it.each(['rec', 'RE C', 'A:B', '', 'X'.repeat(31)])(
    'rejects the invalid key part %j',
    (part) => {
      const { service } = setup();

      expect(() => service.nextVoucherNumber(CONGREGATION, part)).toThrow(
        'Invalid sequence key part',
      );
    },
  );

  it('builds keys that fit the 60 characters of the column', () => {
    expect(SequenceKeys.voucher('X'.repeat(30)).length).toBeLessThanOrEqual(60);
    expect(SequenceKeys.certificate('X'.repeat(30)).length).toBeLessThanOrEqual(
      60,
    );
  });
});

describe('document code formats', () => {
  it('formats a member code', () => {
    expect(formatMemberCode('SC', 153)).toBe('SC-0153');
    expect(formatMemberCode('SC', 12345)).toBe('SC-12345');
  });

  it('formats a voucher code with the year of its date', () => {
    expect(formatVoucherCode('REC', '2026-03-05', 1872)).toBe('REC-2026-01872');
    expect(formatVoucherCode('CI', new Date('2026-12-31T00:00:00Z'), 12)).toBe(
      'CI-2026-00012',
    );
  });

  it('formats a certificate code', () => {
    expect(formatCertificateCode('MEM', '2026-10-28', 31)).toBe(
      'CERT-MEM-2026-0031',
    );
  });
});
