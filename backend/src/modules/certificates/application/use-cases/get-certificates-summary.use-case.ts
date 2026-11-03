import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { CARD_EXPIRY_WARNING_DAYS } from '../certificate-errors.js';
import { addDays } from '../certificate-document.js';
import { readScope } from '../certificate-mappers.js';
import type { CertificatesSummaryView } from '../certificate.models.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';
import {
  MEMBERSHIP_CARD_REPOSITORY,
  type MembershipCardRepository,
} from '../ports/membership-card.repository.js';

/**
 * Counters of the module for the current year (Bogota time). "Issued" counts every certificate of
 * the year, voided ones included; the voided ones are also counted on their own.
 */
@Injectable()
export class GetCertificatesSummaryUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
    @Inject(MEMBERSHIP_CARD_REPOSITORY)
    private readonly cards: MembershipCardRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    congregationId?: number,
  ): Promise<CertificatesSummaryView> {
    const scope = readScope(tenant, congregationId);
    const today = this.clock.today();
    const year = Number(today.slice(0, 4));

    const [issued, cards] = await Promise.all([
      this.certificates.countIssued(scope, {
        from: `${year}-01-01`,
        to: `${year}-12-31`,
      }),
      this.cards.counts(scope, today, addDays(today, CARD_EXPIRY_WARNING_DAYS)),
    ]);
    return {
      year,
      today,
      issued: issued.issued,
      voided: issued.voided,
      cardsValid: cards.valid,
      cardsExpiringSoon: cards.expiringSoon,
      cardsExpired: cards.expired,
    };
  }
}
