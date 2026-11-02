// Distribution of a gross tithe between the denomination, the local fund and the pastor, with
// the formula of TitheSettlementRule (backend/prisma/schema/accounting.prisma):
//   nationalShare  = gross × nationalShareRate
//   localFundShare = (gross − nationalShare) × localFundRate
//   pastorNet      = gross − nationalShare − localFundShare
// Each component is rounded to whole pesos and the rounding remainder goes to the largest one,
// so the three values always add up exactly to the gross.
import { roundMoney } from '../../data/accounting-rules';
import { TitheSettlementRule } from '../../data/accounting.models';

export interface TitheAllocation {
  readonly nationalShare: number;
  readonly localFundShare: number;
  readonly pastorNet: number;
}

export type TitheRates = Pick<TitheSettlementRule, 'nationalShareRate' | 'localFundRate'>;

/** Effective share of the gross of each component (0–1). */
export function effectiveRates({ nationalShareRate, localFundRate }: TitheRates): TitheAllocation {
  const net = 1 - nationalShareRate;
  return {
    nationalShare: nationalShareRate,
    localFundShare: net * localFundRate,
    pastorNet: net * (1 - localFundRate),
  };
}

export function allocateTithe(grossTithe: number, rates: TitheRates): TitheAllocation {
  const gross = roundMoney(grossTithe);
  const shares = effectiveRates(rates);
  const values: Record<keyof TitheAllocation, number> = {
    nationalShare: Math.round(gross * shares.nationalShare),
    localFundShare: Math.round(gross * shares.localFundShare),
    pastorNet: Math.round(gross * shares.pastorNet),
  };
  const remainder = roundMoney(gross - values.nationalShare - values.localFundShare - values.pastorNet);
  if (remainder !== 0) {
    const largest = (Object.keys(values) as (keyof TitheAllocation)[]).reduce((max, key) =>
      values[key] > values[max] ? key : max,
    );
    values[largest] = roundMoney(values[largest] + remainder);
  }
  return values;
}
