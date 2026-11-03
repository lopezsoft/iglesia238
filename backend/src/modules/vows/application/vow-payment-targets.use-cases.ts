import { Inject, Injectable } from '@nestjs/common';
import {
  ConflictDomainException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import type { PersonOption } from '../../contributions/application/contribution.models.js';
import { toPersonOption } from '../../contributions/application/search-contributors.use-case.js';
import { formatPesos } from '../../contributions/domain/vow-payment-rules.js';
import {
  vowBalance,
  vowPledgeCode,
  vowPledgeStatusFor,
} from '../domain/vow-pledge-rules.js';
import type { VowPledgeOption, VowPledgeRecord } from './vow-pledge.models.js';
import { VOWS_REPOSITORY, type VowsRepository } from './vows.repository.js';

export interface VowPaymentTarget {
  pledge: VowPledgeOption;
  person: PersonOption;
}

function toOption(record: VowPledgeRecord): VowPledgeOption {
  const balance = vowBalance(record.pledgedAmount, record.paid);
  const label = [
    vowPledgeCode(record),
    record.description,
    `saldo ${formatPesos(balance)}`,
  ]
    .filter(Boolean)
    .join(' · ');
  return {
    id: record.id,
    label,
    personId: record.personId,
    contributionTypeId: record.contributionTypeId,
    balance,
  };
}

/** Payments can go to a pledge of any sede of the denomination, so these lookups ignore the active sede. */
function denominationWide(tenant: TenantContext): TenantScope {
  return TenantScope.of(tenant.tenantScope().denominationId);
}

const isOpen = (record: VowPledgeRecord): boolean =>
  vowPledgeStatusFor(record.storedStatus, record.pledgedAmount, record.paid) ===
    'ACTIVE' && vowBalance(record.pledgedAmount, record.paid) > 0;

/**
 * Pledges of one person and type that still accept payments. They are looked up across the whole
 * denomination, not only the active sede: a transferred member pays in the new sede a pledge made
 * in the previous one.
 */
@Injectable()
export class ListOpenVowPledgesUseCase {
  constructor(
    @Inject(VOWS_REPOSITORY) private readonly repository: VowsRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    personId: number,
    contributionTypeId: number,
  ): Promise<VowPledgeOption[]> {
    const records = await this.repository.findActive(
      denominationWide(tenant),
      personId,
      contributionTypeId,
    );
    return records.filter(isOpen).map(toOption);
  }
}

/** What "Registrar abono" from Votos preselects in the contribution form: the pledge and its person. */
@Injectable()
export class GetVowPaymentTargetUseCase {
  constructor(
    @Inject(VOWS_REPOSITORY) private readonly repository: VowsRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    pledgeId: number,
  ): Promise<VowPaymentTarget> {
    const scope = denominationWide(tenant);
    const record = await this.repository.findById(scope, pledgeId);
    const contributor = record
      ? await this.repository.findContributor(scope, record.personId)
      : null;
    if (!record || !contributor) {
      throw new NotFoundDomainException('La promesa de voto no existe.');
    }
    if (!isOpen(record)) {
      throw new ConflictDomainException(
        'La promesa ya está cumplida o cancelada: no admite abonos.',
        'VOW_PLEDGE_CLOSED',
      );
    }
    return { pledge: toOption(record), person: toPersonOption(contributor) };
  }
}
