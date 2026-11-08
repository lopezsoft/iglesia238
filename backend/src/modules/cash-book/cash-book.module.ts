import { Module } from '@nestjs/common';
import { CONGREGATION_LOOKUP } from '../../common/accounting/congregation-lookup.port.js';
import { PrismaCongregationLookup } from '../../infrastructure/prisma/prisma-congregation-lookup.js';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import { CashBookQueryService } from './application/cash-book-query.service.js';
import { CashBookReportService } from './application/cash-book-report.service.js';
import { CASH_BOOK_REPOSITORY } from './application/cash-book.repository.js';
import { CashMovementsService } from './application/cash-movements.service.js';
import { ConsolidationService } from './application/consolidation.service.js';
import { PeriodCloseService } from './application/period-close.service.js';
import { VOUCHER_READ_REPOSITORY } from './application/voucher.repository.js';
import { VOUCHER_PDF_RENDERER } from './application/ports/voucher-pdf.renderer.js';
import { VoucherDocumentService } from './application/voucher-document.service.js';
import { VouchersService } from './application/vouchers.service.js';
import { PrismaCashBookRepository } from './infrastructure/prisma-cash-book.repository.js';
import { PdfkitVoucherRenderer } from './infrastructure/pdfkit-voucher.renderer.js';
import { PrismaVoucherReadRepository } from './infrastructure/prisma-voucher-read.repository.js';
import {
  CashBookController,
  PeriodCloseController,
  VouchersController,
} from './presentation/cash-book.controllers.js';

/** Cash book of a sede: movements, reversals, consolidation of contributions, period close and vouchers. */
@Module({
  imports: [PrismaModule],
  controllers: [CashBookController, PeriodCloseController, VouchersController],
  providers: [
    CashBookQueryService,
    CashBookReportService,
    CashMovementsService,
    ConsolidationService,
    PeriodCloseService,
    VouchersService,
    VoucherDocumentService,
    { provide: VOUCHER_PDF_RENDERER, useClass: PdfkitVoucherRenderer },
    { provide: CASH_BOOK_REPOSITORY, useClass: PrismaCashBookRepository },
    { provide: VOUCHER_READ_REPOSITORY, useClass: PrismaVoucherReadRepository },
    { provide: CONGREGATION_LOOKUP, useClass: PrismaCongregationLookup },
  ],
})
export class CashBookModule {}
