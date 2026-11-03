import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';

/** Percentages of a TitheSettlementRule as fractions (0.21 = 21 %), at most four decimals. */
export interface TitheRates {
  readonly nationalShareRate: number;
  readonly localFundRate: number;
}

export interface TitheAllocation {
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
}

const BASIS = 10_000n;
const CENTS_PER_PESO = 100n;

/** Rates arrive as numbers with up to four decimals; basis points make the arithmetic exact. */
function basisPoints(rate: number): bigint {
  return BigInt(Math.round(rate * Number(BASIS)));
}

/** Rounds a non-negative fraction half up, like Math.round, without floating point. */
function roundDivision(numerator: bigint, denominator: bigint): bigint {
  return (2n * numerator + denominator) / (2n * denominator);
}

/** Share of the gross that each destination receives (0-1), for display. */
export function effectiveRates({
  nationalShareRate,
  localFundRate,
}: TitheRates): TitheAllocation {
  const net = 1 - nationalShareRate;
  return {
    nationalShare: round6(nationalShareRate),
    localFundShare: round6(net * localFundRate),
    pastorNet: round6(net * (1 - localFundRate)),
  };
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

/**
 * Distribution of a gross tithe, with the formula of TitheSettlementRule:
 *   nationalShare  = gross x nationalShareRate
 *   localFundShare = (gross - nationalShare) x localFundRate
 *   pastorNet      = gross - nationalShare - localFundShare
 * Each component is rounded to whole pesos and the rounding remainder goes to the largest one, so the
 * three values always add up exactly to the gross (the database checks that sum).
 */
export function allocateTithe(
  grossTithe: number,
  rates: TitheRates,
): TitheAllocation {
  const grossCents = BigInt(toCents(grossTithe));
  const national = basisPoints(rates.nationalShareRate);
  const local = basisPoints(rates.localFundRate);
  const net = BASIS - national;

  const pesos = {
    nationalShare: roundDivision(grossCents * national, BASIS * CENTS_PER_PESO),
    localFundShare: roundDivision(
      grossCents * net * local,
      BASIS * BASIS * CENTS_PER_PESO,
    ),
    pastorNet: roundDivision(
      grossCents * net * (BASIS - local),
      BASIS * BASIS * CENTS_PER_PESO,
    ),
  };

  const cents: Record<keyof TitheAllocation, bigint> = {
    nationalShare: pesos.nationalShare * CENTS_PER_PESO,
    localFundShare: pesos.localFundShare * CENTS_PER_PESO,
    pastorNet: pesos.pastorNet * CENTS_PER_PESO,
  };
  const remainder =
    grossCents - cents.nationalShare - cents.localFundShare - cents.pastorNet;
  if (remainder !== 0n) {
    const keys = Object.keys(cents) as (keyof TitheAllocation)[];
    const largest = keys.reduce((max, key) =>
      cents[key] > cents[max] ? key : max,
    );
    cents[largest] += remainder;
  }

  return {
    nationalShare: fromCents(Number(cents.nationalShare)),
    localFundShare: fromCents(Number(cents.localFundShare)),
    pastorNet: fromCents(Number(cents.pastorNet)),
  };
}
