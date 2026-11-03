import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { cardNotFound } from '../certificate-errors.js';
import {
  cardNumberOf,
  cardStatusOf,
  readScope,
} from '../certificate-mappers.js';
import type { PdfFile } from '../certificate.models.js';
import {
  DOCUMENT_PDF_RENDERER,
  type DocumentPdfRenderer,
} from '../ports/document-pdf.renderer.js';
import {
  MEMBERSHIP_CARD_REPOSITORY,
  type MembershipCardRepository,
} from '../ports/membership-card.repository.js';

/** Card in CR80 size (front and back). An expired or voided card is stamped, not refused. */
@Injectable()
export class RenderCardPdfUseCase {
  constructor(
    @Inject(MEMBERSHIP_CARD_REPOSITORY)
    private readonly cards: MembershipCardRepository,
    @Inject(DOCUMENT_PDF_RENDERER)
    private readonly renderer: DocumentPdfRenderer,
    private readonly clock: Clock,
  ) {}

  async execute(tenant: TenantContext, id: number): Promise<PdfFile> {
    const card = await this.cards.findById(readScope(tenant), id);
    if (!card) {
      throw cardNotFound();
    }
    const cardNumber = cardNumberOf(card);
    const content = await this.renderer.card({
      denominationName: card.denominationName,
      congregationName: card.congregationName,
      memberName: card.memberName,
      cardNumber,
      issuedOn: card.issuedOn,
      expiresOn: card.expiresOn,
      status: cardStatusOf(card, this.clock.today()),
    });
    return { filename: `carne-${cardNumber}.pdf`, content };
  }
}
