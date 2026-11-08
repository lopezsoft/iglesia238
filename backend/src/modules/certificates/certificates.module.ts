import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../config/environment.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { CERTIFICATE_CONTEXT_READER } from './application/ports/certificate-context.reader.js';
import { CERTIFICATE_MEMBER_READER } from './application/ports/certificate-member.reader.js';
import { CERTIFICATE_MEMBER_SEARCH } from './application/ports/certificate-member.search.js';
import { MembershipModule } from '../membership/membership.module.js';
import { MembershipMemberSearch } from './infrastructure/membership-member-search.js';
import { CERTIFICATE_REPOSITORY } from './application/ports/certificate.repository.js';
import {
  CERTIFICATE_VERIFICATION_LINKS,
  CERTIFICATE_VERIFICATION_READER,
} from './application/ports/certificate-verification.js';
import { VerifyCertificateUseCase } from './application/use-cases/verify-certificate.use-case.js';
import { CERTIFICATE_DONATION_READER } from './application/ports/certificate-donation.reader.js';
import { PrismaCertificateDonationReader } from './infrastructure/prisma-certificate-donation.reader.js';
import { HmacCertificateVerificationLinks } from './infrastructure/hmac-certificate-verification-links.js';
import { PrismaCertificateVerificationReader } from './infrastructure/prisma-certificate-verification.reader.js';
import { PublicCertificatesController } from './presentation/public-certificates.controller.js';
import {
  ListCertificateTypeTemplatesUseCase,
  PreviewCertificateTemplateUseCase,
  UpdateCertificateTypeUseCase,
} from './application/use-cases/certificate-type-templates.use-cases.js';
import { CertificateTypeTemplatesController } from './presentation/certificate-type-templates.controller.js';
import { DOCUMENT_PDF_RENDERER } from './application/ports/document-pdf.renderer.js';
import { MEMBERSHIP_CARD_REPOSITORY } from './application/ports/membership-card.repository.js';
import { CertificateDraftService } from './application/use-cases/certificate-draft.service.js';
import { ExportCertificatesUseCase } from './application/use-cases/export-certificates.use-case.js';
import { GetCertificateUseCase } from './application/use-cases/get-certificate.use-case.js';
import { GetCertificatesSummaryUseCase } from './application/use-cases/get-certificates-summary.use-case.js';
import { GetIssuingContextUseCase } from './application/use-cases/get-issuing-context.use-case.js';
import { IssueCardUseCase } from './application/use-cases/issue-card.use-case.js';
import { IssueCertificateUseCase } from './application/use-cases/issue-certificate.use-case.js';
import { ListCardCandidatesUseCase } from './application/use-cases/list-card-candidates.use-case.js';
import { ListCardsUseCase } from './application/use-cases/list-cards.use-case.js';
import { ListCertificateTypesUseCase } from './application/use-cases/list-certificate-types.use-case.js';
import { ListCertificatesUseCase } from './application/use-cases/list-certificates.use-case.js';
import { PreviewCertificateUseCase } from './application/use-cases/preview-certificate.use-case.js';
import { RenderCardPdfUseCase } from './application/use-cases/render-card-pdf.use-case.js';
import { RenderCertificatePdfUseCase } from './application/use-cases/render-certificate-pdf.use-case.js';
import {
  FindCertificateMemberUseCase,
  SearchCertificateMembersUseCase,
} from './application/use-cases/search-certificate-members.use-case.js';
import { VoidCardUseCase } from './application/use-cases/void-card.use-case.js';
import { VoidCertificateUseCase } from './application/use-cases/void-certificate.use-case.js';
import { PdfkitDocumentRenderer } from './infrastructure/pdfkit-document.renderer.js';
import { PrismaCertificateContextReader } from './infrastructure/prisma-certificate-context.reader.js';
import { PrismaCertificateMemberReader } from './infrastructure/prisma-certificate-member.reader.js';
import { PrismaCertificateRepository } from './infrastructure/prisma-certificate.repository.js';
import { PrismaMembershipCardRepository } from './infrastructure/prisma-membership-card.repository.js';
import { CertificateTypesController } from './presentation/certificate-types.controller.js';
import { CertificatesController } from './presentation/certificates.controller.js';
import { MembershipCardsController } from './presentation/membership-cards.controller.js';

/**
 * Certificates and membership cards of a sede (D-01, D-02). Numbering, audit, transactions and the
 * clock come from the global FoundationModule.
 */
@Module({
  imports: [PrismaModule, MembershipModule],
  controllers: [
    CertificatesController,
    CertificateTypesController,
    MembershipCardsController,
    PublicCertificatesController,
    CertificateTypeTemplatesController,
  ],
  providers: [
    { provide: CERTIFICATE_REPOSITORY, useClass: PrismaCertificateRepository },
    {
      provide: MEMBERSHIP_CARD_REPOSITORY,
      useClass: PrismaMembershipCardRepository,
    },
    {
      provide: CERTIFICATE_MEMBER_READER,
      useClass: PrismaCertificateMemberReader,
    },
    {
      provide: CERTIFICATE_MEMBER_SEARCH,
      useClass: MembershipMemberSearch,
    },
    {
      provide: CERTIFICATE_CONTEXT_READER,
      useClass: PrismaCertificateContextReader,
    },
    { provide: DOCUMENT_PDF_RENDERER, useClass: PdfkitDocumentRenderer },
    {
      provide: CERTIFICATE_DONATION_READER,
      useClass: PrismaCertificateDonationReader,
    },
    {
      provide: CERTIFICATE_VERIFICATION_READER,
      useClass: PrismaCertificateVerificationReader,
    },
    {
      provide: CERTIFICATE_VERIFICATION_LINKS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => {
        const dedicated = config.get('CERTIFICATE_VERIFICATION_SECRET', {
          infer: true,
        });
        return new HmacCertificateVerificationLinks({
          secret: dedicated ?? config.get('JWT_SECRET', { infer: true }),
          derived: dedicated === undefined,
          appBaseUrl: config.get('APP_BASE_URL', { infer: true }),
        });
      },
    },
    VerifyCertificateUseCase,
    ListCertificateTypeTemplatesUseCase,
    UpdateCertificateTypeUseCase,
    PreviewCertificateTemplateUseCase,
    CertificateDraftService,
    GetIssuingContextUseCase,
    ListCertificateTypesUseCase,
    PreviewCertificateUseCase,
    IssueCertificateUseCase,
    ListCertificatesUseCase,
    ExportCertificatesUseCase,
    GetCertificateUseCase,
    VoidCertificateUseCase,
    GetCertificatesSummaryUseCase,
    RenderCertificatePdfUseCase,
    SearchCertificateMembersUseCase,
    FindCertificateMemberUseCase,
    ListCardsUseCase,
    ListCardCandidatesUseCase,
    IssueCardUseCase,
    VoidCardUseCase,
    RenderCardPdfUseCase,
  ],
})
export class CertificatesModule {}
