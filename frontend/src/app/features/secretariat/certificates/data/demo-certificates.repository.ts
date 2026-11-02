import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase, formatMemberCode } from '../../../../core/demo/demo-database';
import { demoCommand } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { Member, personFullName } from '../../../../core/models/membership.model';
import { PageRequest, matchesText, paginate } from '../../../../shared/utils/pagination';
import {
  buildCertificateSnapshot,
  certificateNumber,
  certificateSeriesKey,
  daysBetween,
} from './certificate-document';
import {
  CARD_EXPIRY_WARNING_DAYS,
  CardCandidate,
  CardFilter,
  CardListItem,
  CardPage,
  CardStatus,
  Certificate,
  CertificateDetail,
  CertificateFilter,
  CertificateListItem,
  CertificatePage,
  CertificatesSummary,
  IssueCardCommand,
  IssueCertificateCommand,
  IssuingContext,
  MemberOption,
  MembershipCard,
  NOTES_MAX_LENGTH,
  VOID_REASON_MIN_LENGTH,
  VoidCommand,
} from './certificates.models';
import { CERTIFICATES_TODAY, CertificatesRepository } from './certificates.repository';
import { CertificatesDemoStore } from './certificates-demo-store';
import { letterheadOf, memberOptionOf, signersOf, userName } from './demo-certificates-lookup';

const MEMBER_SEARCH_LIMIT = 8;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface Sede {
  readonly denominationId: number;
  readonly congregationId: number;
}

/**
 * Demo adapter: simulates the API over in-memory tables. It filters by the tenant of the active
 * scope, numbers each series without gaps through DocumentSequence and enforces the rules of
 * D-01 (certificates) and D-02 (membership cards).
 */
@Injectable()
export class DemoCertificatesRepository extends CertificatesRepository {
  private readonly db = inject(DemoDatabase);
  private readonly store = inject(CertificatesDemoStore);
  private readonly auth = inject(AuthService);
  private readonly today = inject(CERTIFICATES_TODAY);

  override issuingContext(): Observable<IssuingContext> {
    return demoCommand(() => {
      const sede = this.requireSede();
      const today = this.today();
      const year = Number(today.slice(0, 4));
      const signers = signersOf(this.db, sede.congregationId);
      return {
        congregationId: sede.congregationId,
        year,
        today,
        letterhead: letterheadOf(this.db, sede.congregationId),
        signers: { pastorName: signers.pastorName, secretaryName: signers.secretaryName },
        issuedByName: this.auth.user()?.displayName ?? '—',
        types: this.store.certificateTypes
          .filter((type) => type.denominationId === sede.denominationId)
          .map((type) => ({
            id: type.id,
            code: type.code,
            name: type.name,
            nextNumber: certificateNumber(
              type.code,
              year,
              this.lastValue(sede, type.code, year) + 1,
            ),
          })),
      };
    });
  }

  override summary(): Observable<CertificatesSummary> {
    return demoCommand(() => {
      const today = this.today();
      const year = Number(today.slice(0, 4));
      const certificates = this.visibleCertificates().filter((item) =>
        item.issuedOn.startsWith(String(year)),
      );
      const cards = this.visibleCards().map((card) => this.cardStatus(card, today));
      return {
        year,
        issued: certificates.length,
        voided: certificates.filter((item) => item.voidedAt !== null).length,
        cardsValid: cards.filter((card) => card.status === 'VALID').length,
        cardsExpiringSoon: cards.filter(
          (card) =>
            card.status === 'VALID' && (card.daysToExpire ?? Infinity) <= CARD_EXPIRY_WARNING_DAYS,
        ).length,
        cardsExpired: cards.filter((card) => card.status === 'EXPIRED').length,
      };
    });
  }

  override searchMembers(query: string): Observable<readonly MemberOption[]> {
    return demoCommand(() => {
      const sede = this.requireSede();
      if (query.trim() === '') {
        return [];
      }
      return this.store
        .activeMembersOf(sede.congregationId)
        .filter((member) => member.denominationId === sede.denominationId)
        .map((member) => ({ member, option: memberOptionOf(this.db, member) }))
        .filter(({ member, option }) =>
          matchesText(
            [
              option.fullName,
              option.code,
              option.documentLabel,
              this.db.person(member.personId)?.documentNumber ?? null,
            ],
            query,
          ),
        )
        .slice(0, MEMBER_SEARCH_LIMIT)
        .map(({ option }) => option);
    });
  }

  override findMember(memberId: number): Observable<MemberOption> {
    return demoCommand(() =>
      memberOptionOf(this.db, this.activeMemberOfSede(memberId, this.requireSede())),
    );
  }

  override listCertificates(filter: CertificateFilter): Observable<CertificatePage> {
    return demoCommand(() => {
      const rows = this.visibleCertificates()
        .map((certificate) => this.toListItem(certificate))
        .filter((item) => filter.typeCode === null || item.typeCode === filter.typeCode)
        .filter((item) => filter.status === null || item.status === filter.status)
        .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id - a.id);
      return paginate(rows, filter);
    });
  }

  override getCertificate(id: number): Observable<CertificateDetail> {
    return demoCommand(() => {
      const certificate = this.visibleCertificate(id);
      return { ...this.toListItem(certificate), snapshot: certificate.snapshot };
    });
  }

  override issueCertificate(command: IssueCertificateCommand): Observable<CertificateListItem> {
    return demoCommand(() => {
      this.requireIssuePermission();
      const sede = this.requireSede();
      const type = this.store.certificateTypes.find(
        (item) =>
          item.id === command.certificateTypeId && item.denominationId === sede.denominationId,
      );
      if (!type) {
        throw new DomainError(
          'CERTIFICATE_TYPE_NOT_FOUND',
          'El tipo de certificado no existe en esta denominación.',
        );
      }
      const member = this.activeMemberOfSede(command.memberId, sede);
      if (type.code === 'BAU' && member.isBaptized !== true) {
        throw new DomainError(
          'MEMBER_NOT_BAPTIZED',
          'El certificado de bautismo solo se emite a miembros con el bautismo registrado.',
        );
      }
      const notes = command.notes?.trim() || null;
      if (notes && notes.length > NOTES_MAX_LENGTH) {
        throw new DomainError(
          'NOTES_TOO_LONG',
          `Las observaciones admiten máximo ${NOTES_MAX_LENGTH} caracteres.`,
        );
      }
      const signers = signersOf(this.db, sede.congregationId);
      if (!signers.pastorName) {
        throw new DomainError(
          'PASTOR_REQUIRED',
          'La sede no tiene un pastor vigente que firme el certificado. Asígnalo en Usuarios y roles.',
        );
      }
      const user = this.auth.user();
      const issuedOn = this.today();
      const year = Number(issuedOn.slice(0, 4));
      // Every check passed: only now the series advances, so a rejected request leaves no gap.
      const sequenceNumber = this.nextSequenceValue(sede, type.code, year);
      const number = certificateNumber(type.code, year, sequenceNumber);
      const certificate: Certificate = {
        id: this.db.nextId(this.store.certificates),
        denominationId: sede.denominationId,
        congregationId: sede.congregationId,
        certificateTypeId: type.id,
        memberId: member.id,
        sequenceNumber,
        issuedOn,
        expiresOn: null,
        notes,
        pastorSignerId: signers.pastorSignerId,
        secretarySignerId: signers.secretarySignerId,
        snapshot: buildCertificateSnapshot({
          number,
          typeCode: type.code,
          typeName: type.name,
          issuedOn,
          letterhead: letterheadOf(this.db, sede.congregationId),
          signers,
          issuedByName: user?.displayName ?? '—',
          member: memberOptionOf(this.db, member),
          notes,
        }),
        voidedAt: null,
        createdAt: new Date().toISOString(),
        issuedById: user?.id ?? 0,
        voidReason: null,
      };
      this.store.certificates.push(certificate);
      this.db.audit({
        userId: user?.id ?? null,
        denominationId: sede.denominationId,
        congregationId: sede.congregationId,
        entity: 'Certificate',
        entityId: String(certificate.id),
        action: 'CERTIFICATE_ISSUED',
        changes: { number: { from: null, to: number } },
      });
      return this.toListItem(certificate);
    });
  }

  override voidCertificate(command: VoidCommand): Observable<CertificateListItem> {
    return demoCommand(() => {
      this.requireIssuePermission();
      const sede = this.requireSede();
      const certificate = this.visibleCertificate(command.id);
      if (certificate.voidedAt !== null) {
        throw new DomainError('CERTIFICATE_ALREADY_VOIDED', 'El certificado ya estaba anulado.');
      }
      const reason = this.requireVoidReason(command.reason);
      const voided = this.db.replace(this.store.certificates, {
        ...certificate,
        voidedAt: new Date().toISOString(),
        voidReason: reason,
      });
      this.db.audit({
        userId: this.auth.user()?.id ?? null,
        denominationId: sede.denominationId,
        congregationId: sede.congregationId,
        entity: 'Certificate',
        entityId: String(certificate.id),
        action: 'CERTIFICATE_VOIDED',
        changes: {
          status: { from: 'ISSUED', to: 'VOIDED' },
          number: { from: certificate.snapshot.number, to: certificate.snapshot.number },
        },
      });
      return this.toListItem(voided);
    });
  }

  override listCards(filter: PageRequest & { readonly status: CardFilter }): Observable<CardPage> {
    return demoCommand(() => {
      const today = this.today();
      const rows = this.visibleCards()
        .map((card) => this.cardStatus(card, today))
        .filter((item) => filter.status === null || item.status === filter.status)
        .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id - a.id);
      return paginate(rows, filter);
    });
  }

  override cardCandidates(): Observable<readonly CardCandidate[]> {
    return demoCommand(() => {
      const sede = this.requireSede();
      const today = this.today();
      return this.store
        .activeMembersOf(sede.congregationId)
        .filter((member) => member.denominationId === sede.denominationId)
        .map((member) => {
          const statuses = this.cardsOf(member).map(
            (card) => this.cardStatus(card, today).status,
          );
          return { member, statuses };
        })
        .filter(({ statuses }) => !statuses.includes('VALID'))
        .map(({ member, statuses }) => {
          const option = memberOptionOf(this.db, member);
          return {
            memberId: member.id,
            fullName: option.fullName,
            cardNumber: option.code,
            hasExpiredCard: statuses.includes('EXPIRED'),
          };
        })
        .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
    });
  }

  override issueCard(command: IssueCardCommand): Observable<CardListItem> {
    return demoCommand(() => {
      this.requireIssuePermission();
      const sede = this.requireSede();
      const member = this.activeMemberOfSede(command.memberId, sede);
      if (!ISO_DATE.test(command.issuedOn) || !ISO_DATE.test(command.expiresOn)) {
        throw new DomainError(
          'INVALID_DATE',
          'Las fechas de emisión y vencimiento no son válidas.',
        );
      }
      if (command.expiresOn <= command.issuedOn) {
        throw new DomainError(
          'INVALID_EXPIRY',
          'El vencimiento debe ser posterior a la fecha de emisión.',
        );
      }
      const today = this.today();
      if (command.issuedOn > today) {
        throw new DomainError('INVALID_DATE', 'La fecha de emisión no puede ser futura.');
      }
      if (command.expiresOn < today) {
        throw new DomainError('INVALID_DATE', 'El carné no puede emitirse ya vencido.');
      }
      if (this.cardsOf(member).some((card) => this.cardStatus(card, today).status === 'VALID')) {
        throw new DomainError(
          'ACTIVE_CARD_EXISTS',
          'El miembro ya tiene un carné vigente. Anúlalo antes de emitir uno nuevo.',
        );
      }
      const entry = this.db.currentRegistryEntry(member.id);
      if (!entry || entry.congregationId !== sede.congregationId) {
        throw new DomainError(
          'MEMBER_NOT_REGISTERED',
          'El miembro no tiene número en el libro de esta sede.',
        );
      }
      this.supersedeCardsOfPreviousSedes(member, today);
      const card: MembershipCard = {
        id: this.db.nextId(this.store.membershipCards),
        denominationId: sede.denominationId,
        memberId: member.id,
        issuedOn: command.issuedOn,
        expiresOn: command.expiresOn,
        congregationId: sede.congregationId,
        memberNumber: entry.memberNumber,
        voidedAt: null,
        voidReason: null,
      };
      this.store.membershipCards.push(card);
      this.db.audit({
        userId: this.auth.user()?.id ?? null,
        denominationId: sede.denominationId,
        congregationId: sede.congregationId,
        entity: 'MembershipCard',
        entityId: String(card.id),
        action: 'MEMBERSHIP_CARD_ISSUED',
        changes: { expiresOn: { from: null, to: card.expiresOn } },
      });
      return this.cardStatus(card, today);
    });
  }

  override voidCard(command: VoidCommand): Observable<CardListItem> {
    return demoCommand(() => {
      this.requireIssuePermission();
      const sede = this.requireSede();
      const card = this.visibleCards().find((item) => item.id === command.id);
      if (!card) {
        throw new DomainError('CARD_NOT_FOUND', 'El carné no existe o pertenece a otra sede.');
      }
      if (card.voidedAt !== null) {
        throw new DomainError('CARD_ALREADY_VOIDED', 'El carné ya estaba anulado.');
      }
      const reason = this.requireVoidReason(command.reason);
      const voided = this.db.replace(this.store.membershipCards, {
        ...card,
        voidedAt: new Date().toISOString(),
        voidReason: reason,
      });
      this.db.audit({
        userId: this.auth.user()?.id ?? null,
        denominationId: sede.denominationId,
        congregationId: sede.congregationId,
        entity: 'MembershipCard',
        entityId: String(card.id),
        action: 'MEMBERSHIP_CARD_VOIDED',
        changes: { status: { from: 'VALID', to: 'VOIDED' } },
      });
      return this.cardStatus(voided, this.today());
    });
  }

  // ---- Tenant and rules ----

  private requireSede(): Sede {
    const { denominationId, congregationId } = this.auth.tenant();
    if (denominationId === null) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para consultar certificados.');
    }
    if (congregationId === null) {
      throw new DomainError(
        'CONGREGATION_REQUIRED',
        'Selecciona una sede en el selector superior: los certificados y carnés se emiten por sede.',
      );
    }
    return { denominationId, congregationId };
  }

  private requireIssuePermission(): void {
    if (!this.auth.can('certificates.issue')) {
      throw new DomainError(
        'FORBIDDEN',
        'No tienes permiso para emitir o anular certificados y carnés.',
      );
    }
  }

  private requireVoidReason(reason: string): string {
    const trimmed = reason.trim();
    if (trimmed.length < VOID_REASON_MIN_LENGTH) {
      throw new DomainError(
        'VOID_REASON_REQUIRED',
        `Escribe el motivo de la anulación (mínimo ${VOID_REASON_MIN_LENGTH} caracteres).`,
      );
    }
    return trimmed;
  }

  /** The member must be active and belong to the active sede: documents are issued at the member's sede. */
  private activeMemberOfSede(memberId: number, sede: Sede): Member {
    const member = this.db.members.find(
      (item) => item.id === memberId && item.denominationId === sede.denominationId,
    );
    if (!member) {
      throw new DomainError('MEMBER_NOT_FOUND', 'El miembro no existe en esta denominación.');
    }
    if (member.congregationId !== sede.congregationId) {
      throw new DomainError(
        'MEMBER_NOT_IN_SEDE',
        'El miembro pertenece a otra sede: el documento se emite en la sede actual del miembro.',
      );
    }
    if (member.status !== 'ACTIVE') {
      throw new DomainError('MEMBER_NOT_ACTIVE', 'Solo se emiten documentos a miembros activos.');
    }
    return member;
  }

  /** Rows of the tenant: the active sede, or the whole denomination when no sede is selected. */
  private inTenant(row: {
    readonly denominationId: number;
    readonly congregationId: number;
  }): boolean {
    const { denominationId, congregationId } = this.auth.tenant();
    return (
      denominationId !== null &&
      row.denominationId === denominationId &&
      (congregationId === null || row.congregationId === congregationId)
    );
  }

  private visibleCertificates(): Certificate[] {
    return this.store.certificates.filter((certificate) => this.inTenant(certificate));
  }

  private visibleCertificate(id: number): Certificate {
    const certificate = this.visibleCertificates().find((item) => item.id === id);
    if (!certificate) {
      throw new DomainError(
        'CERTIFICATE_NOT_FOUND',
        'El certificado no existe o pertenece a otra sede.',
      );
    }
    return certificate;
  }

  private visibleCards(): MembershipCard[] {
    return this.store.membershipCards.filter((card) => this.inTenant(card));
  }

  /**
   * D-02: cards of the member's current sede. A card of a previous sede (internal transfer) does
   * not block a new one: it carries the old sede's number and that sede can no longer manage it.
   */
  private cardsOf(member: Member): MembershipCard[] {
    return this.store.membershipCards.filter(
      (card) => card.memberId === member.id && card.congregationId === member.congregationId,
    );
  }

  /** Voids the still valid cards of previous sedes when the current sede issues a new one. */
  private supersedeCardsOfPreviousSedes(member: Member, today: string): void {
    const previous = this.store.membershipCards.filter(
      (card) =>
        card.memberId === member.id &&
        card.congregationId !== member.congregationId &&
        this.cardStatus(card, today).status === 'VALID',
    );
    for (const card of previous) {
      this.db.replace(this.store.membershipCards, {
        ...card,
        voidedAt: new Date().toISOString(),
        voidReason: 'Reemplazado por un carné de la nueva sede tras el traslado.',
      });
      this.db.audit({
        userId: this.auth.user()?.id ?? null,
        denominationId: card.denominationId,
        congregationId: card.congregationId,
        entity: 'MembershipCard',
        entityId: String(card.id),
        action: 'MEMBERSHIP_CARD_VOIDED',
        changes: { status: { from: 'VALID', to: 'VOIDED' } },
      });
    }
  }

  private lastValue(sede: Sede, typeCode: string, year: number): number {
    const key = certificateSeriesKey(typeCode, year);
    return (
      this.store.documentSequences.find(
        (row) => row.congregationId === sede.congregationId && row.key === key,
      )?.lastValue ?? 0
    );
  }

  /** Increments the DocumentSequence row of the series (created on the first certificate of the year). */
  private nextSequenceValue(sede: Sede, typeCode: string, year: number): number {
    const key = certificateSeriesKey(typeCode, year);
    const index = this.store.documentSequences.findIndex(
      (row) => row.congregationId === sede.congregationId && row.key === key,
    );
    if (index === -1) {
      this.store.documentSequences.push({ ...sede, key, lastValue: 1 });
      return 1;
    }
    const next = this.store.documentSequences[index].lastValue + 1;
    this.store.documentSequences[index] = {
      ...this.store.documentSequences[index],
      lastValue: next,
    };
    return next;
  }

  private toListItem(certificate: Certificate): CertificateListItem {
    const type = this.store.certificateTypes.find(
      (item) => item.id === certificate.certificateTypeId,
    );
    return {
      id: certificate.id,
      number: certificate.snapshot.number,
      typeCode: type?.code ?? '',
      typeName: type?.name ?? '—',
      memberId: certificate.memberId,
      memberName: certificate.snapshot.memberName,
      memberCode: certificate.snapshot.memberCode,
      issuedOn: certificate.issuedOn,
      issuedByName: userName(this.db, certificate.issuedById),
      status: certificate.voidedAt === null ? 'ISSUED' : 'VOIDED',
      voidReason: certificate.voidReason,
      voidedAt: certificate.voidedAt,
    };
  }

  private cardStatus(card: MembershipCard, today: string): CardListItem {
    const status: CardStatus =
      card.voidedAt !== null ? 'VOIDED' : card.expiresOn < today ? 'EXPIRED' : 'VALID';
    const person = this.db.person(
      this.db.members.find((member) => member.id === card.memberId)?.personId ?? 0,
    );
    return {
      id: card.id,
      memberId: card.memberId,
      memberName: person ? personFullName(person) : '—',
      cardNumber: formatMemberCode(
        this.db.congregation(card.congregationId)?.name ?? '',
        card.memberNumber,
      ),
      issuedOn: card.issuedOn,
      expiresOn: card.expiresOn,
      status,
      daysToExpire: status === 'VALID' ? daysBetween(today, card.expiresOn) : null,
      voidReason: card.voidReason,
    };
  }
}
