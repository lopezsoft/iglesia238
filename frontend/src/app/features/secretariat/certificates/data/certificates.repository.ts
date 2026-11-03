import { Observable } from 'rxjs';
import {
  CardCandidatePage,
  CardCandidateQuery,
  CardFilter,
  CardListItem,
  CardPage,
  CertificateDetail,
  CertificateExportFilter,
  CertificateFilter,
  CertificateListItem,
  CertificatePage,
  CertificatePreview,
  CertificateTypeSummary,
  CertificatesSummary,
  IssueCardCommand,
  IssueCertificateCommand,
  IssuingContext,
  MemberOption,
  VoidCommand,
} from './certificates.models';

/**
 * Port of the certificates and membership cards module (D-01, D-02). Every call acts on the
 * scope of the active session (`X-Scope`): lists also work for a whole denomination, while
 * issuing and voiding need a sede (the API answers `CONGREGATION_SCOPE_REQUIRED` otherwise).
 */
export abstract class CertificatesRepository {
  /** Certificate types of the denomination: works without a sede. */
  abstract types(): Observable<readonly CertificateTypeSummary[]>;
  /** Sede, signers and series of the active sede. */
  abstract issuingContext(): Observable<IssuingContext>;
  abstract summary(): Observable<CertificatesSummary>;
  /** Active members of the active sede matching name, member code or document number. */
  abstract searchMembers(query: string): Observable<readonly MemberOption[]>;
  /** One active member of the active sede, e.g. preselected from ?memberId=. */
  abstract findMember(memberId: number): Observable<MemberOption>;

  /** What the certificate would print right now, with its next number (not reserved). */
  abstract preview(command: IssueCertificateCommand): Observable<CertificatePreview>;
  abstract listCertificates(filter: CertificateFilter): Observable<CertificatePage>;
  abstract getCertificate(id: number): Observable<CertificateDetail>;
  abstract issueCertificate(command: IssueCertificateCommand): Observable<CertificateListItem>;
  abstract voidCertificate(command: VoidCommand): Observable<CertificateListItem>;
  /** PDF drawn by the server from what was issued; the screen opens or saves the Blob. */
  abstract certificatePdf(id: number): Observable<Blob>;
  /** CSV (UTF-8 with BOM, `;`) of the filtered list. */
  abstract exportCertificates(filter: CertificateExportFilter): Observable<Blob>;

  abstract listCards(filter: CardFilter): Observable<CardPage>;
  abstract cardCandidates(query: CardCandidateQuery): Observable<CardCandidatePage>;
  abstract issueCard(command: IssueCardCommand): Observable<CardListItem>;
  abstract voidCard(command: VoidCommand): Observable<CardListItem>;
  abstract cardPdf(id: number): Observable<Blob>;
}
