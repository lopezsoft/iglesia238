import { allocateTithe, effectiveRates } from './tithe-allocation.js';

const OCTOBER_GROSS = 3_230_000;

describe('allocateTithe', () => {
  it('applies the rule formula and adds up exactly to the gross', () => {
    expect(
      allocateTithe(OCTOBER_GROSS, {
        nationalShareRate: 0.1,
        localFundRate: 0.3,
      }),
    ).toEqual({
      nationalShare: 323_000,
      localFundShare: 872_100,
      pastorNet: 2_034_900,
    });
  });

  it('gives the rounding remainder to the largest component', () => {
    // 2.5 -> 3, 6.75 -> 7, 15.75 -> 16 adds 26: the extra peso comes off the pastoral share.
    expect(
      allocateTithe(25, { nationalShareRate: 0.1, localFundRate: 0.3 }),
    ).toEqual({ nationalShare: 3, localFundShare: 7, pastorNet: 15 });
    expect(
      allocateTithe(1_000.5, { nationalShareRate: 0.1, localFundRate: 0.3 }),
    ).toEqual({ nationalShare: 100, localFundShare: 270, pastorNet: 630.5 });
  });

  it('always sums to the gross, whatever the amount and the rates', () => {
    for (const gross of [
      0, 0.01, 1, 7, 333, 98_765.43, 1_234_567, 999_999_999.99,
    ]) {
      for (const rates of [
        { nationalShareRate: 0.21, localFundRate: 0.03 },
        { nationalShareRate: 0.1, localFundRate: 0.3 },
        { nationalShareRate: 0.1575, localFundRate: 0.0525 },
        { nationalShareRate: 0, localFundRate: 0 },
        { nationalShareRate: 1, localFundRate: 1 },
      ]) {
        const { nationalShare, localFundShare, pastorNet } = allocateTithe(
          gross,
          rates,
        );
        expect(
          Math.round((nationalShare + localFundShare + pastorNet) * 100),
        ).toBe(Math.round(gross * 100));
        expect(nationalShare).toBeGreaterThanOrEqual(0);
        expect(localFundShare).toBeGreaterThanOrEqual(0);
        expect(pastorNet).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('settles nothing for a zero gross', () => {
    expect(
      allocateTithe(0, { nationalShareRate: 0.21, localFundRate: 0.03 }),
    ).toEqual({ nationalShare: 0, localFundShare: 0, pastorNet: 0 });
  });
});

describe('effectiveRates', () => {
  it('expresses every destination as a share of the gross', () => {
    expect(
      effectiveRates({ nationalShareRate: 0.1, localFundRate: 0.3 }),
    ).toEqual({
      nationalShare: 0.1,
      localFundShare: 0.27,
      pastorNet: 0.63,
    });
  });
});
