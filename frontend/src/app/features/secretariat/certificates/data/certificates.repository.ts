import { InjectionToken } from '@angular/core';
import { Observable } from 'rxjs';
import { PageRequest } from '../../../../shared/utils/pagination';
import { localIsoDate } from './certificate-document';
import {
  CardCandidate,
  CardFilter,
  CardListItem,
  CardPage,
  CertificateDetail,
  CertificateFilter,
  CertificateListItem,
  CertificatePage,
  CertificatesSummary,
  IssueCardCommand,
  IssueCertificateCommand,
  IssuingContext,
  MemberOption,
  VoidCommand,
} from './certificates.models';

/**
 * Port of the certificates and membership cards module (D-01, D-02). Every call acts on the
 * tenant of the active scope; issuing requires a sede and the `certificates.issue` permission.
 */
export abstract class CertificatesRepository {
  /** Sede, signers and series of the active scope. Fails with CONGREGATION_REQUIRED without a sede. */
  abstract issuingContext(): Observable<IssuingContext>;
  abstract summary(): Observable<CertificatesSummary>;
  /** Active members of the active sede matching name, member code or document number. */
  abstract searchMembers(query: string): Observable<readonly MemberOption[]>;
  /** One active member of the active sede, e.g. preselected from ?memberId=. */
  abstract findMember(memberId: number): Observable<MemberOption>;

  abstract listCertificates(filter: CertificateFilter): Observable<CertificatePage>;
  abstract getCertificate(id: number): Observable<CertificateDetail>;
  abstract issueCertificate(command: IssueCertificateCommand): Observable<CertificateListItem>;
  abstract voidCertificate(command: VoidCommand): Observable<CertificateListItem>;

  abstract listCards(filter: PageRequest & { readonly status: CardFilter }): Observable<CardPage>;
  abstract cardCandidates(): Observable<readonly CardCandidate[]>;
  abstract issueCard(command: IssueCardCommand): Observable<CardListItem>;
  abstract voidCard(command: VoidCommand): Observable<CardListItem>;
}

/** Today's date (YYYY-MM-DD) for validity and numbering; tests replace it. */
export const CERTIFICATES_TODAY = new InjectionToken<() => string>('CERTIFICATES_TODAY', {
  providedIn: 'root',
  factory: () => () => localIsoDate(),
});
