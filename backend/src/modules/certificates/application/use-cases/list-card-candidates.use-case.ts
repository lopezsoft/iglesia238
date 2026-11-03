import { Inject, Injectable } from '@nestjs/common';
import type { Page } from '../../../../common/pagination/page.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import type { CardCandidateRecord, PageParams } from '../certificate.models.js';
import {
  MEMBERSHIP_CARD_REPOSITORY,
  type MembershipCardRepository,
} from '../ports/membership-card.repository.js';

/** Active members of the active sede that can receive a card: registered and without a valid card. */
@Injectable()
export class ListCardCandidatesUseCase {
  constructor(
    @Inject(MEMBERSHIP_CARD_REPOSITORY)
    private readonly cards: MembershipCardRepository,
    private readonly clock: Clock,
  ) {}

  execute(
    tenant: TenantContext,
    input: { q?: string; paging: PageParams },
  ): Promise<Page<CardCandidateRecord>> {
    return this.cards.listCandidates(
      tenant.congregationScope(),
      { q: input.q, today: this.clock.today() },
      input.paging,
    );
  }
}
