import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../../../common/time/bogota-time.js';
import { certificateNotVerifiable } from '../certificate-errors.js';
import {
  maskHolderName,
  verificationStatus,
} from '../certificate-verification.js';
import type { CertificateVerificationView } from '../certificate.models.js';
import {
  CERTIFICATE_VERIFICATION_LINKS,
  CERTIFICATE_VERIFICATION_READER,
  type CertificateVerificationLinks,
  type CertificateVerificationReader,
} from '../ports/certificate-verification.js';

/** Public check of a certificate from the signed token in its QR code. Anonymous: it reveals no personal data. */
@Injectable()
export class VerifyCertificateUseCase {
  constructor(
    @Inject(CERTIFICATE_VERIFICATION_LINKS)
    private readonly links: CertificateVerificationLinks,
    @Inject(CERTIFICATE_VERIFICATION_READER)
    private readonly reader: CertificateVerificationReader,
    private readonly clock: Clock,
  ) {}

  async execute(token: string): Promise<CertificateVerificationView> {
    const certificateId = this.links.certificateIdOf(token);
    if (certificateId === null) {
      throw certificateNotVerifiable();
    }
    const record = await this.reader.findById(certificateId);
    if (!record) {
      throw certificateNotVerifiable();
    }
    const today = this.clock.today();
    const { snapshot } = record;
    return {
      status: verificationStatus({
        voidedAt: record.voidedAt,
        expiresOn: record.expiresOn,
        today,
      }),
      number: snapshot.number,
      title: snapshot.title,
      denominationName: snapshot.denominationName,
      congregationName: snapshot.congregationName,
      holderName: maskHolderName(snapshot.memberName),
      issuedOn: record.issuedOn,
      expiresOn: record.expiresOn,
      verifiedOn: today,
    };
  }
}
