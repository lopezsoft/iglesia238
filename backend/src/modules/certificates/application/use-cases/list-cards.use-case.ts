import { Inject, Injectable } from '@nestjs/common';
import { mapPage, type Page } from '../../../../common/pagination/page.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { readScope, toCardListItem } from '../certificate-mappers.js';
import type {
  CardListItemView,
  CardStatus,
  PageParams,
} from '../certificate.models.js';
import {
  MEMBERSHIP_CARD_REPOSITORY,
  type MembershipCardRepository,
} from '../ports/membership-card.repository.js';

export interface ListCardsInput {
  readonly status?: CardStatus;
  readonly q?: string;
  readonly expiringInDays?: number;
  readonly paging: PageParams;
  readonly congregationId?: number;
}

/** Cards of the active sede, or of every sede in a denomination scope. Status is derived from today. */
@Injectable()
export class ListCardsUseCase {
  constructor(
    @Inject(MEMBERSHIP_CARD_REPOSITORY)
    private readonly cards: MembershipCardRepository,
    private readonly clock: Clock,
  ) {}

  async execute(
    tenant: TenantContext,
    input: ListCardsInput,
  ): Promise<Page<CardListItemView>> {
    const scope = readScope(tenant, input.congregationId);
    const today = this.clock.today();
    const page = await this.cards.list(
      scope,
      {
        status: input.status,
        q: input.q,
        expiringInDays: input.expiringInDays,
        today,
      },
      input.paging,
    );
    return mapPage(page, (card) => toCardListItem(card, today));
  }
}
