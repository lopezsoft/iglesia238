import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AUDIT_RECORDER } from '../common/audit/audit-recorder.port.js';
import {
  DOCUMENT_BRANDING_READER,
  DocumentBrandingService,
} from '../common/branding/document-branding.js';
import { DEFAULT_COUNTRY_ISO } from '../common/geo/default-country.js';
import { SmartLogger } from '../common/logging/smart-logger.service.js';
import { EXPOSE_DEV_LINKS } from '../common/mail/dev-link.js';
import { MAILER } from '../common/mail/mailer.port.js';
import { DocumentNumberingService } from '../common/numbering/document-numbering.service.js';
import { DOCUMENT_SEQUENCE_STORE } from '../common/numbering/document-sequence.store.js';
import { TRANSACTION_RUNNER } from '../common/persistence/transaction.js';
import { REPORT_LETTERHEAD_READER } from '../common/reports/report-letterhead.js';
import { REPORT_PDF_RENDERER } from '../common/reports/report-pdf.js';
import { FILE_STORAGE } from '../common/storage/file-storage.port.js';
import { RateLimitGuard } from '../common/rate-limit/rate-limit.guard.js';
import { RateLimitService } from '../common/rate-limit/rate-limit.service.js';
import { RATE_LIMITER } from '../common/rate-limit/rate-limiter.port.js';
import { AccessTokenService } from '../common/security/access-token.service.js';
import { PASSWORD_HASHER } from '../common/security/password-hasher.port.js';
import { SESSION_VALIDATOR } from '../common/security/session-validator.port.js';
import { ASSIGNMENTS_READER } from '../common/tenancy/assignments-reader.port.js';
import { TenantContextResolver } from '../common/tenancy/tenant-context.resolver.js';
import { Clock, SystemClock } from '../common/time/bogota-time.js';
import { Environment, isMailConfigured } from '../config/environment.js';
import { LoggingMailer } from '../infrastructure/mail/logging.mailer.js';
import { PdfkitReportRenderer } from '../infrastructure/pdf/pdfkit-report.renderer.js';
import { LocalFileStorage } from '../infrastructure/storage/local-file-storage.js';
import { NodemailerMailer } from '../infrastructure/mail/nodemailer.mailer.js';
import { PrismaAssignmentsReader } from '../infrastructure/prisma/prisma-assignments.reader.js';
import { PrismaDocumentBrandingReader } from '../infrastructure/prisma/prisma-document-branding.reader.js';
import { PrismaReportLetterheadReader } from '../infrastructure/prisma/prisma-report-letterhead.reader.js';
import { PrismaAuditRecorder } from '../infrastructure/prisma/prisma-audit-recorder.js';
import { PrismaDocumentSequenceStore } from '../infrastructure/prisma/prisma-document-sequence.store.js';
import { PrismaTransactionRunner } from '../infrastructure/prisma/prisma-transaction.js';
import { PrismaModule } from '../infrastructure/prisma/prisma.module.js';
import { PrismaSessionValidator } from '../infrastructure/prisma/prisma-session-validator.js';
import { RedisRateLimiter } from '../infrastructure/redis/redis-rate-limiter.js';
import { RedisModule } from '../infrastructure/redis/redis.module.js';
import { ScryptPasswordHasher } from '../infrastructure/security/scrypt-password-hasher.js';

/**
 * Cross-cutting building blocks every business module relies on: authentication, tenant resolution,
 * rate limiting, hashing, mail, audit, numbering and transactions. It is global, so feature modules
 * inject the ports without importing it. This is where each port is bound to its adapter.
 */
@Global()
@Module({
  imports: [
    PrismaModule,
    RedisModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [
    AccessTokenService,
    TenantContextResolver,
    { provide: ASSIGNMENTS_READER, useClass: PrismaAssignmentsReader },
    { provide: SESSION_VALIDATOR, useClass: PrismaSessionValidator },
    { provide: RATE_LIMITER, useClass: RedisRateLimiter },
    RateLimitService,
    RateLimitGuard,
    { provide: PASSWORD_HASHER, useFactory: () => new ScryptPasswordHasher() },
    {
      provide: MAILER,
      inject: [ConfigService, SmartLogger],
      useFactory: (
        config: ConfigService<Environment, true>,
        logger: SmartLogger,
      ) => {
        const get = <K extends keyof Environment>(key: K) =>
          config.get(key, { infer: true });
        const host = get('SMTP_HOST');
        const from = get('SMTP_FROM');
        if (!isMailConfigured({ SMTP_HOST: host, SMTP_FROM: from })) {
          return new LoggingMailer(logger);
        }
        return new NodemailerMailer(
          {
            host: host as string,
            port: get('SMTP_PORT'),
            secure: get('SMTP_SECURE'),
            user: get('SMTP_USER'),
            password: get('SMTP_PASSWORD'),
            from: from as string,
          },
          logger,
        );
      },
    },
    {
      // One-time links may be echoed in the response only outside production (and only without SMTP).
      provide: EXPOSE_DEV_LINKS,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): boolean =>
        config.get('NODE_ENV', { infer: true }) !== 'production',
    },
    {
      provide: DEFAULT_COUNTRY_ISO,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Environment, true>): string =>
        config.get('DEFAULT_COUNTRY_ISO', { infer: true }),
    },
    {
      // Uploaded files. Only the local disk exists for now; a missing volume is reported at startup.
      provide: FILE_STORAGE,
      inject: [ConfigService, SmartLogger],
      useFactory: async (
        config: ConfigService<Environment, true>,
        logger: SmartLogger,
      ) => {
        const storage = new LocalFileStorage(
          config.get('STORAGE_DIR', { infer: true }),
        );
        const problem = await storage.check();
        if (problem) {
          logger.warn(
            `${problem}. Uploads will fail until it is fixed: mount a persistent volume on STORAGE_DIR.`,
          );
        }
        return storage;
      },
    },
    {
      provide: DOCUMENT_BRANDING_READER,
      useClass: PrismaDocumentBrandingReader,
    },
    DocumentBrandingService,
    { provide: REPORT_PDF_RENDERER, useClass: PdfkitReportRenderer },
    {
      provide: REPORT_LETTERHEAD_READER,
      useClass: PrismaReportLetterheadReader,
    },
    { provide: TRANSACTION_RUNNER, useClass: PrismaTransactionRunner },
    { provide: AUDIT_RECORDER, useClass: PrismaAuditRecorder },
    { provide: DOCUMENT_SEQUENCE_STORE, useClass: PrismaDocumentSequenceStore },
    DocumentNumberingService,
    { provide: Clock, useClass: SystemClock },
  ],
  exports: [
    AccessTokenService,
    TenantContextResolver,
    ASSIGNMENTS_READER,
    SESSION_VALIDATOR,
    RateLimitService,
    RateLimitGuard,
    PASSWORD_HASHER,
    MAILER,
    EXPOSE_DEV_LINKS,
    DEFAULT_COUNTRY_ISO,
    FILE_STORAGE,
    DocumentBrandingService,
    REPORT_PDF_RENDERER,
    REPORT_LETTERHEAD_READER,
    TRANSACTION_RUNNER,
    AUDIT_RECORDER,
    DocumentNumberingService,
    Clock,
  ],
})
export class FoundationModule {}
