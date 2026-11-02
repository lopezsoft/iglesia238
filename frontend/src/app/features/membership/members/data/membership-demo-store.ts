import { Injectable } from '@angular/core';
import {
  ChurchPosition,
  FamilyRelation,
  MemberPastoralRank,
  MemberPosition,
  MemberTransfer,
  PastoralRank,
  PersonStudy,
  SocioeconomicProfile,
} from './members.models';

// Fictional rows that reference the ids of core/demo/demo-fixtures.ts: members 1–4 and 6–27
// belong to Sede Central (1), 5 and 28–39 to Sede Norte (2), 40–47 to Sede Soacha (3) and
// 48–55 to the sedes of the second denomination. Person ids equal member ids.

const CHURCH_POSITIONS: ChurchPosition[] = [
  { id: 1, denominationId: 1, name: 'Diácono', isActive: true },
  { id: 2, denominationId: 1, name: 'Diaconisa', isActive: true },
  { id: 3, denominationId: 1, name: 'Anciano', isActive: true },
  { id: 4, denominationId: 1, name: 'Líder de jóvenes', isActive: true },
  { id: 5, denominationId: 1, name: 'Líder de hermanas', isActive: true },
  { id: 6, denominationId: 1, name: 'Maestro(a) de escuela dominical', isActive: true },
  { id: 7, denominationId: 1, name: 'Músico', isActive: true },
  { id: 8, denominationId: 1, name: 'Ujier', isActive: true },
  { id: 9, denominationId: 1, name: 'Tesorero(a) del comité de damas', isActive: false },
  { id: 10, denominationId: 2, name: 'Diácono', isActive: true },
  { id: 11, denominationId: 2, name: 'Líder de alabanza', isActive: true },
];

const PASTORAL_RANKS: PastoralRank[] = [
  { id: 1, denominationId: 1, name: 'Pastor', isActive: true },
  { id: 2, denominationId: 1, name: 'Pastor asistente', isActive: true },
  { id: 3, denominationId: 1, name: 'Evangelista', isActive: true },
  { id: 4, denominationId: 1, name: 'Diaconisa ordenada', isActive: true },
  { id: 5, denominationId: 1, name: 'Diácono ordenado', isActive: true },
  { id: 6, denominationId: 2, name: 'Pastor', isActive: true },
];

const MEMBER_PASTORAL_RANKS: MemberPastoralRank[] = [
  { memberId: 1, pastoralRankId: 1 },
  { memberId: 4, pastoralRankId: 4 },
  { memberId: 7, pastoralRankId: 5 },
];

const MEMBER_POSITIONS: MemberPosition[] = [
  { id: 1, denominationId: 1, memberId: 4, positionId: 6, startedOn: '2020-02-01', endedOn: null },
  {
    id: 2,
    denominationId: 1,
    memberId: 4,
    positionId: 9,
    startedOn: '2021-01-15',
    endedOn: '2023-12-31',
  },
  { id: 3, denominationId: 1, memberId: 7, positionId: 1, startedOn: '2018-03-01', endedOn: null },
  { id: 4, denominationId: 1, memberId: 9, positionId: 7, startedOn: '2019-06-09', endedOn: null },
  { id: 5, denominationId: 1, memberId: 15, positionId: 3, startedOn: '2016-08-14', endedOn: null },
  { id: 6, denominationId: 1, memberId: 21, positionId: 8, startedOn: '2022-05-01', endedOn: null },
  { id: 7, denominationId: 1, memberId: 22, positionId: 4, startedOn: '2024-01-20', endedOn: null },
  { id: 8, denominationId: 1, memberId: 12, positionId: 5, startedOn: '2021-03-07', endedOn: null },
  { id: 9, denominationId: 1, memberId: 29, positionId: 1, startedOn: '2020-10-04', endedOn: null },
  {
    id: 10,
    denominationId: 2,
    memberId: 48,
    positionId: 10,
    startedOn: '2023-02-12',
    endedOn: null,
  },
];

const FAMILY_RELATIONS: FamilyRelation[] = [
  // Ana María Rojas Díaz (4): father in Sede Central, mother in Sede Soacha.
  { id: 1, denominationId: 1, personId: 4, relativeId: 15, type: 'FATHER' },
  { id: 2, denominationId: 1, personId: 4, relativeId: 40, type: 'MOTHER' },
  { id: 3, denominationId: 1, personId: 15, relativeId: 4, type: 'CHILD' },
  // Daniel Herrera Gil (1) and Daniela Herrera Suárez (18).
  { id: 4, denominationId: 1, personId: 1, relativeId: 18, type: 'CHILD' },
  { id: 5, denominationId: 1, personId: 18, relativeId: 1, type: 'FATHER' },
  { id: 6, denominationId: 2, personId: 48, relativeId: 49, type: 'CHILD' },
];

const PERSON_STUDIES: PersonStudy[] = [
  {
    id: 1,
    denominationId: 1,
    personId: 4,
    studyTypeCode: 'COURSE',
    name: 'Liderazgo de grupos familiares',
    institution: 'Sede Central · Escuela de Líderes',
    status: 'COMPLETED',
    year: 2021,
  },
  {
    id: 2,
    denominationId: 1,
    personId: 4,
    studyTypeCode: 'UNIVERSITY',
    name: 'Contaduría Pública',
    institution: 'Fundación Universitaria del Sur',
    status: 'COMPLETED',
    year: 2011,
  },
  {
    id: 3,
    denominationId: 1,
    personId: 4,
    studyTypeCode: 'THEOLOGICAL',
    name: 'Diplomado en Fundamentos Bíblicos',
    institution: 'Seminario Monte de Sion',
    status: 'COMPLETED',
    year: 2016,
  },
  {
    id: 4,
    denominationId: 1,
    personId: 4,
    studyTypeCode: 'CHRISTIAN_EDUCATION',
    name: 'Formación de maestros de escuela dominical, nivel 2',
    institution: 'Sede Central',
    status: 'IN_PROGRESS',
    year: 2026,
  },
  {
    id: 5,
    denominationId: 1,
    personId: 1,
    studyTypeCode: 'THEOLOGICAL',
    name: 'Licenciatura en Teología',
    institution: 'Seminario Monte de Sion',
    status: 'COMPLETED',
    year: 1978,
  },
  {
    id: 6,
    denominationId: 1,
    personId: 2,
    studyTypeCode: 'TECHNICAL',
    name: 'Técnico en Asistencia Administrativa',
    institution: 'Instituto Técnico Los Andes',
    status: 'COMPLETED',
    year: 1984,
  },
  {
    id: 7,
    denominationId: 1,
    personId: 9,
    studyTypeCode: 'COURSE',
    name: 'Música y alabanza congregacional',
    institution: 'Sede Central',
    status: 'IN_PROGRESS',
    year: 2025,
  },
  {
    id: 8,
    denominationId: 2,
    personId: 48,
    studyTypeCode: 'COURSE',
    name: 'Discipulado básico',
    institution: 'Vida Nueva Chapinero',
    status: 'COMPLETED',
    year: 2022,
  },
];

const SOCIOECONOMIC_PROFILES: SocioeconomicProfile[] = [
  {
    personId: 4,
    denominationId: 1,
    hasHealthCoverage: true,
    hasPension: true,
    hasOccupationalRiskCoverage: true,
    isSubsidizedRegime: false,
    hasFamilyCompensation: true,
    sisbenLevel: null,
    isDisplaced: false,
    updatedAt: '2026-09-14T15:00:00Z',
  },
  {
    personId: 14,
    denominationId: 1,
    hasHealthCoverage: true,
    hasPension: true,
    hasOccupationalRiskCoverage: false,
    isSubsidizedRegime: true,
    hasFamilyCompensation: false,
    sisbenLevel: 2,
    isDisplaced: false,
    updatedAt: '2026-06-02T14:30:00Z',
  },
  {
    personId: 23,
    denominationId: 1,
    hasHealthCoverage: true,
    hasPension: null,
    hasOccupationalRiskCoverage: null,
    isSubsidizedRegime: true,
    hasFamilyCompensation: null,
    sisbenLevel: 1,
    isDisplaced: true,
    updatedAt: '2026-08-21T16:10:00Z',
  },
  {
    personId: 48,
    denominationId: 2,
    hasHealthCoverage: true,
    hasPension: false,
    hasOccupationalRiskCoverage: false,
    isSubsidizedRegime: false,
    hasFamilyCompensation: false,
    sisbenLevel: null,
    isDisplaced: false,
    updatedAt: '2026-05-10T13:00:00Z',
  },
];

const MEMBER_TRANSFERS: MemberTransfer[] = [
  // Matches the closed Sede Norte registry entry of Ana María Rojas in the shared fixtures.
  {
    id: 1,
    denominationId: 1,
    memberId: 4,
    originCongregationId: 2,
    destinationCongregationId: 1,
    externalDestinationName: null,
    status: 'COMPLETED',
    transferDate: '2019-06-30',
    approvedById: null,
    approvedAt: '2019-06-30T15:00:00Z',
    notes: 'Cambio de residencia',
    createdAt: '2019-06-20T15:00:00Z',
  },
  {
    id: 2,
    denominationId: 1,
    memberId: 17,
    originCongregationId: 1,
    destinationCongregationId: null,
    externalDestinationName: 'Iglesia Cristiana Puerta del Cielo (Tunja)',
    status: 'COMPLETED',
    transferDate: '2026-03-15',
    approvedById: 3,
    approvedAt: '2026-03-15T16:00:00Z',
    notes: 'Cambio de residencia',
    createdAt: '2026-03-10T15:00:00Z',
  },
];

/**
 * Tables of the members module that the shared DemoDatabase does not hold. Only the demo
 * adapter of this feature injects it; it lives for the browser session.
 */
@Injectable({ providedIn: 'root' })
export class MembershipDemoStore {
  readonly churchPositions: ChurchPosition[] = structuredClone(CHURCH_POSITIONS);
  readonly pastoralRanks: PastoralRank[] = structuredClone(PASTORAL_RANKS);
  readonly memberPastoralRanks: MemberPastoralRank[] = structuredClone(MEMBER_PASTORAL_RANKS);
  readonly memberPositions: MemberPosition[] = structuredClone(MEMBER_POSITIONS);
  readonly familyRelations: FamilyRelation[] = structuredClone(FAMILY_RELATIONS);
  readonly personStudies: PersonStudy[] = structuredClone(PERSON_STUDIES);
  readonly socioeconomicProfiles: SocioeconomicProfile[] = structuredClone(SOCIOECONOMIC_PROFILES);
  readonly memberTransfers: MemberTransfer[] = structuredClone(MEMBER_TRANSFERS);

  pastoralRankOf(memberId: number): number | null {
    return (
      this.memberPastoralRanks.find((row) => row.memberId === memberId)?.pastoralRankId ?? null
    );
  }

  setPastoralRank(memberId: number, pastoralRankId: number | null): void {
    const index = this.memberPastoralRanks.findIndex((row) => row.memberId === memberId);
    if (index === -1) {
      this.memberPastoralRanks.push({ memberId, pastoralRankId });
    } else {
      this.memberPastoralRanks[index] = { memberId, pastoralRankId };
    }
  }

  saveSocioeconomicProfile(profile: SocioeconomicProfile): void {
    const index = this.socioeconomicProfiles.findIndex((row) => row.personId === profile.personId);
    if (index === -1) {
      this.socioeconomicProfiles.push(profile);
    } else {
      this.socioeconomicProfiles[index] = profile;
    }
  }

  /** Names of the open positions of a member, in catalog order. */
  openPositionNames(memberId: number): string[] {
    const open = new Set(
      this.memberPositions
        .filter((row) => row.memberId === memberId && row.endedOn === null)
        .map((row) => row.positionId),
    );
    return this.churchPositions
      .filter((position) => open.has(position.id))
      .map((position) => position.name);
  }
}
