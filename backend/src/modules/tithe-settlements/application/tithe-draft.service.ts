import { Inject, Injectable } from '@nestjs/common';
import {
  fromCents,
  toCents,
} from '../../../common/accounting/accounting-rules.js';
import {
  BusinessRuleException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type { Transaction } from '../../../common/persistence/transaction.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../common/time/bogota-time.js';
import { allocateTithe, effectiveRates } from './tithe-allocation.js';
import type { TitheAllocation } from './tithe-allocation.js';
import {
  assertSettlementRange,
  overlappingSettlementError,
} from './tithe-range.js';
import type {
  BookingTargets,
  TitheComponentView,
  TitheContributionData,
  TitheRangeView,
} from './tithe-settlement.models.js';
import {
  TITHE_RULE_READER,
  TITHE_SETTLEMENT_READER,
} from './tithe-settlement.ports.js';
import type {
  CongregationInfo,
  TitheRuleRecord,
  TitheRuleReader,
  TitheSettlementReader,
} from './tithe-settlement.ports.js';

/** What a range of the sede would settle, computed from the current data. Nothing is stored. */
export interface TitheDraft {
  readonly today: string;
  readonly range: TitheRangeView;
  readonly congregation: CongregationInfo;
  readonly rule: TitheRuleRecord;
  readonly settleable: readonly TitheContributionData[];
  readonly excludedCount: number;
  readonly grossTithe: number;
  readonly allocation: TitheAllocation;
  readonly bookings: BookingTargets;
  readonly components: readonly TitheComponentView[];
}

/**
 * Single computation behind the preview and the confirmation, so the treasurer confirms exactly
 * what was previewed. The server recomputes it on confirm; the client never sends amounts.
 */
@Injectable()
export class TitheDraftService {
  constructor(
    @Inject(TITHE_SETTLEMENT_READER)
    private readonly settlements: TitheSettlementReader,
    @Inject(TITHE_RULE_READER) private readonly rules: TitheRuleReader,
    private readonly clock: Clock,
  ) {}

  async build(
    scope: TenantScope,
    range: TitheRangeView,
    transaction?: Transaction,
  ): Promise<TitheDraft> {
    const today = this.clock.today();
    assertSettlementRange(range, today);

    const overlapping = await this.settlements.findOverlapping(
      scope,
      range,
      transaction,
    );
    if (overlapping) {
      throw overlappingSettlementError(overlapping);
    }

    const rule = await this.rules.findInForce(
      scope.denominationId,
      today,
      transaction,
    );
    if (!rule) {
      throw new BusinessRuleException(
        'La denominación no tiene porcentajes de liquidación vigentes. Regístralos en la sección «Porcentajes del diezmo».',
        'RULE_NOT_FOUND',
      );
    }

    const congregation = await this.settlements.findCongregation(scope);
    if (!congregation) {
      throw new NotFoundDomainException('La sede no existe.');
    }

    const inRange = await this.settlements.findTithesInRange(
      scope,
      range,
      transaction,
    );
    const settleable = inRange
      .filter(
        (tithe) =>
          tithe.status === 'RECORDED' && tithe.titheSettlementId === null,
      )
      .sort((a, b) => a.receivedOn.localeCompare(b.receivedOn) || a.id - b.id);
    const grossTithe = fromCents(
      settleable.reduce((sum, tithe) => sum + toCents(tithe.amount), 0),
    );
    const allocation = allocateTithe(grossTithe, rule);
    const bookings = await this.settlements.findBookingTargets(
      scope,
      transaction,
    );

    return {
      today,
      range,
      congregation,
      rule,
      settleable,
      excludedCount: inRange.filter((tithe) => tithe.status === 'VOIDED')
        .length,
      grossTithe,
      allocation,
      bookings,
      components: this.components(rule, allocation, bookings),
    };
  }

  private components(
    rule: TitheRuleRecord,
    allocation: TitheAllocation,
    bookings: BookingTargets,
  ): TitheComponentView[] {
    const rates = effectiveRates(rule);
    const booking = (
      target: BookingTargets['nationalShare'],
      amount: number,
    ): TitheComponentView['booking'] =>
      target && amount > 0
        ? {
            accountCode: target.accountCode,
            accountName: target.accountName,
            fundName: target.fundName,
          }
        : null;
    return [
      {
        key: 'NATIONAL',
        rate: rates.nationalShare,
        amount: allocation.nationalShare,
        booking: booking(bookings.nationalShare, allocation.nationalShare),
      },
      {
        key: 'LOCAL_FUND',
        rate: rates.localFundShare,
        amount: allocation.localFundShare,
        booking: null,
      },
      {
        key: 'PASTOR',
        rate: rates.pastorNet,
        amount: allocation.pastorNet,
        booking: booking(bookings.pastorNet, allocation.pastorNet),
      },
    ];
  }
}
