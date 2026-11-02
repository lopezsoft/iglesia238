import { Injectable, inject } from '@angular/core';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { Member } from '../../../../core/models/membership.model';
import {
  addDays,
  addYears,
  buildCertificateSnapshot,
  certificateNumber,
  certificateSeriesKey,
  isoDateOf,
} from './certificate-document';
import {
  Certificate,
  CertificateType,
  DocumentSequence,
  MembershipCard,
} from './certificates.models';
import { letterheadOf, memberOptionOf, signersOf, userName } from './demo-certificates-lookup';

const SEEDED_TYPES: ReadonlyArray<Pick<CertificateType, 'code' | 'name' | 'validityDays'>> = [
  { code: 'MEM', name: 'Certificado de membresía', validityDays: null },
  { code: 'TRA', name: 'Carta de traslado', validityDays: 90 },
  { code: 'BAU', name: 'Certificado de bautismo', validityDays: null },
  { code: 'ASI', name: 'Constancia de asistencia', validityDays: 30 },
];

interface SeriesSeed {
  readonly congregationId: number;
  readonly typeCode: string;
  readonly count: number;
  readonly issuerIds: readonly number[];
  readonly lastIssuedOn: string;
}

/** Fictional 2026 series. Sede Central reaches CERT-MEM-2026-0031 (audit log entry 7). */
const SERIES: readonly SeriesSeed[] = [
  {
    congregationId: 1,
    typeCode: 'MEM',
    count: 31,
    issuerIds: [4, 4, 4, 3],
    lastIssuedOn: '2026-10-28',
  },
  { congregationId: 1, typeCode: 'TRA', count: 7, issuerIds: [4], lastIssuedOn: '2026-10-26' },
  { congregationId: 1, typeCode: 'BAU', count: 14, issuerIds: [4, 3], lastIssuedOn: '2026-10-20' },
  { congregationId: 1, typeCode: 'ASI', count: 10, issuerIds: [4], lastIssuedOn: '2026-10-17' },
  { congregationId: 2, typeCode: 'MEM', count: 4, issuerIds: [6], lastIssuedOn: '2026-10-15' },
  { congregationId: 2, typeCode: 'TRA', count: 1, issuerIds: [6], lastIssuedOn: '2026-09-02' },
  { congregationId: 4, typeCode: 'MEM', count: 3, issuerIds: [8], lastIssuedOn: '2026-08-21' },
];

const VOIDED: Readonly<Record<string, string>> = {
  'CERT-MEM-2026-0030': 'Error en el número de documento del miembro.',
  'CERT-BAU-2026-0013': 'Fecha de bautismo incorrecta; se reemplazó por CERT-BAU-2026-0014.',
};

const SERIES_START = '2026-01-12';
const SEED_YEAR = 2026;

/**
 * In-memory tables of the certificates module (CertificateType, DocumentSequence, Certificate,
 * MembershipCard) with fictional rows that reference the shared demo members. Only the demo
 * adapter injects it.
 */
@Injectable({ providedIn: 'root' })
export class CertificatesDemoStore {
  private readonly db = inject(DemoDatabase);

  readonly certificateTypes: CertificateType[] = this.db.denominations.flatMap((denomination, d) =>
    SEEDED_TYPES.map((type, t) => ({
      ...type,
      id: d * SEEDED_TYPES.length + t + 1,
      denominationId: denomination.id,
      template: null,
    })),
  );
  readonly documentSequences: DocumentSequence[] = [];
  readonly certificates: Certificate[] = [];
  readonly membershipCards: MembershipCard[] = [];

  constructor() {
    for (const series of SERIES) {
      this.seedSeries(series);
    }
    this.seedCards();
  }

  activeMembersOf(congregationId: number): Member[] {
    return this.db.members.filter(
      (member) => member.congregationId === congregationId && member.status === 'ACTIVE',
    );
  }

  private seedSeries(series: SeriesSeed): void {
    const congregation = this.db.congregation(series.congregationId);
    const type = this.certificateTypes.find(
      (item) =>
        item.denominationId === congregation?.denominationId && item.code === series.typeCode,
    );
    if (!congregation || !type) {
      return;
    }
    const candidates = this.activeMembersOf(congregation.id).filter(
      (member) => series.typeCode !== 'BAU' || member.isBaptized === true,
    );
    const letterhead = letterheadOf(this.db, congregation.id);
    const signers = signersOf(this.db, congregation.id);
    for (let sequenceNumber = 1; sequenceNumber <= series.count; sequenceNumber++) {
      const number = certificateNumber(series.typeCode, SEED_YEAR, sequenceNumber);
      const isLastMembership = congregation.id === 1 && number === 'CERT-MEM-2026-0031';
      // Ana María Rojas (member 4) holds the last membership certificate, as in the audit log.
      const member = isLastMembership
        ? (candidates.find((item) => item.id === 4) ?? candidates[0])
        : candidates[(sequenceNumber * 7 + series.typeCode.length) % candidates.length];
      const issuedOn = seriesDate(series, sequenceNumber);
      const issuedById = series.issuerIds[sequenceNumber % series.issuerIds.length];
      const voidReason = congregation.id === 1 ? (VOIDED[number] ?? null) : null;
      // Ids 1–31 are the Sede Central membership series, so certificate 31 is CERT-MEM-2026-0031.
      const id = this.certificates.length + 1;
      this.certificates.push({
        id,
        denominationId: congregation.denominationId,
        congregationId: congregation.id,
        certificateTypeId: type.id,
        memberId: member.id,
        sequenceNumber,
        issuedOn,
        expiresOn: type.validityDays ? addDays(issuedOn, type.validityDays) : null,
        notes: null,
        pastorSignerId: signers.pastorSignerId,
        secretarySignerId: signers.secretarySignerId,
        snapshot: buildCertificateSnapshot({
          number,
          typeCode: type.code,
          typeName: type.name,
          issuedOn,
          letterhead,
          signers,
          issuedByName: userName(this.db, issuedById),
          member: memberOptionOf(this.db, member),
          notes: null,
        }),
        voidedAt: voidReason ? `${issuedOn}T21:00:00Z` : null,
        createdAt: `${issuedOn}T15:30:00Z`,
        issuedById,
        voidReason,
      });
    }
    this.documentSequences.push({
      denominationId: congregation.denominationId,
      congregationId: congregation.id,
      key: certificateSeriesKey(series.typeCode, SEED_YEAR),
      lastValue: series.count,
    });
  }

  /** A mix of valid, expiring, expired and voided cards for each seeded sede. */
  private seedCards(): void {
    for (const congregationId of [1, 2, 4]) {
      this.activeMembersOf(congregationId).forEach((member, index) => {
        const issuedOn = cardIssueDate(index);
        if (issuedOn === null) {
          return;
        }
        this.pushCard(member, issuedOn);
        // One member lost a card and received a new one the same year.
        if (congregationId === 1 && index === 2) {
          this.replaceLastCard('Carné extraviado; se emitió uno nuevo.', '2026-06-15');
          this.pushCard(member, '2026-06-15');
        }
      });
    }
  }

  private pushCard(member: Member, issuedOn: string): void {
    const entry = this.db.currentRegistryEntry(member.id);
    if (!entry) {
      return;
    }
    this.membershipCards.push({
      id: this.membershipCards.length + 1,
      denominationId: member.denominationId,
      memberId: member.id,
      congregationId: entry.congregationId,
      memberNumber: entry.memberNumber,
      issuedOn,
      expiresOn: addYears(issuedOn, 2),
      voidedAt: null,
      voidReason: null,
    });
  }

  private replaceLastCard(reason: string, voidedOn: string): void {
    const last = this.membershipCards[this.membershipCards.length - 1];
    this.membershipCards[this.membershipCards.length - 1] = {
      ...last,
      voidedAt: `${voidedOn}T15:00:00Z`,
      voidReason: reason,
    };
  }
}

/** Evenly spread from SERIES_START to the last issue date of the series. */
function seriesDate(series: SeriesSeed, sequenceNumber: number): string {
  if (series.count === 1) {
    return series.lastIssuedOn;
  }
  const start = Date.parse(`${SERIES_START}T12:00:00Z`);
  const end = Date.parse(`${series.lastIssuedOn}T12:00:00Z`);
  const date = new Date(start + ((end - start) * (sequenceNumber - 1)) / (series.count - 1));
  return isoDateOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/**
 * Issue date of the seeded card of the n-th active member, or null for members without a card.
 * Cards last two years, so 2024 cards are expired or about to expire in November 2026.
 */
function cardIssueDate(index: number): string | null {
  const day = (index % 27) + 1;
  switch (index % 6) {
    case 0:
      return null;
    case 1:
      return isoDateOf(2025, (index % 12) + 1, day);
    case 2:
      return isoDateOf(2026, (index % 9) + 1, day);
    case 3:
      return isoDateOf(2024, (index % 9) + 1, day);
    case 4:
      return isoDateOf(2024, 11, 20 + (index % 8));
    default:
      return isoDateOf(2025, 6, day);
  }
}
