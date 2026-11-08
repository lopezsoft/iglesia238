import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module.js';
import {
  BRANDING_REPOSITORY,
  LOGO_EMBEDDING_PROBE,
} from './application/ports/branding.ports.js';
import {
  GetBrandingUseCase,
  ReadLogoFileUseCase,
  RemoveLogoUseCase,
  UpdateBrandColorUseCase,
  UploadLogoUseCase,
} from './application/use-cases/branding.use-cases.js';
import { PdfkitLogoProbe } from './infrastructure/pdfkit-logo.probe.js';
import { PrismaBrandingRepository } from './infrastructure/prisma-branding.repository.js';
import { BrandingController } from './presentation/branding.controller.js';
import { PublicBrandingController } from './presentation/public-branding.controller.js';

/**
 * Logo and color of a denomination. The file lives in the file storage (global, from the FoundationModule); the
 * database keeps only its key. Numbering, audit and transactions also come from the FoundationModule.
 */
@Module({
  imports: [PrismaModule],
  controllers: [BrandingController, PublicBrandingController],
  providers: [
    { provide: BRANDING_REPOSITORY, useClass: PrismaBrandingRepository },
    { provide: LOGO_EMBEDDING_PROBE, useClass: PdfkitLogoProbe },
    GetBrandingUseCase,
    UploadLogoUseCase,
    RemoveLogoUseCase,
    UpdateBrandColorUseCase,
    ReadLogoFileUseCase,
  ],
})
export class BrandingModule {}
