import { Observable } from 'rxjs';
import { CertificateVerification } from './certificate-verification.models';

/** Port of the public verification of a certificate (the page of the QR code). */
export abstract class CertificateVerificationRepository {
  abstract verify(token: string): Observable<CertificateVerification>;
}
