// In-memory implementations of the membership ports, for the unit tests of the use cases. They
// filter by tenant exactly as the Prisma repositories do, so a use case that forgets the scope
// fails its isolation test here too.
import type {
  AuditEntry,
  AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { DocumentNumberingService } from '../../../../common/numbering/document-numbering.service.js';
import type { DocumentSequenceStore } from '../../../../common/numbering/document-sequence.store.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { ageOn } from '../member-rules.js';
import type {
  CatalogItem,
  ConsentRow,
  ConsentView,
  CongregationRef,
  CurrentRegistryEntry,
  ExistingPerson,
  FamilyRelationRow,
  FamilyRelationType,
  FamilyRelationView,
  MemberDetail,
  MemberListCriteria,
  MemberListResult,
  MemberListRow,
  MemberPositionRow,
  MemberReference,
  MemberRegistryView,
  MemberStatus,
  MembershipDataPatch,
  NewMemberRecord,
  PersonSearchCriteria,
  PersonSearchRow,
  PersonStudyView,
  PrivacyPolicyRef,
  ResolvedPersonData,
  Sex,
  SocioeconomicProfileData,
  SocioeconomicProfileView,
} from '../member.models.js';
import type {
  ConsentRepository,
  FamilyRepository,
  NewConsentRecord,
  NewRegistryEntry,
  NewStudyRecord,
  NewTransferRecord,
  PeopleSearchRepository,
  PositionRepository,
  RegistryRepository,
  SocioeconomicRepository,
  StudyRepository,
} from '../ports/member-details.repositories.js';
import type { MemberRepository } from '../ports/member.repository.js';
import type {
  CatalogCodes,
  CatalogResolution,
  CatalogResolver,
  PersonRepository,
} from '../ports/person.repository.js';
import { formatMemberCode, maskDocument } from '../person-text.js';

export const TODAY = '2026-11-02';

export class FixedClock extends Clock {
  constructor(private readonly instant = new Date('2026-11-02T15:00:00.000Z')) {
    super();
  }

  now(): Date {
    return this.instant;
  }
}

export interface PersonRow {
  id: number;
  denominationId: number;
  userId: number | null;
  firstName: string;
  lastName: string;
  secondLastName: string | null;
  sex: Sex | null;
  birthDate: string | null;
  documentTypeId: number | null;
  documentNumber: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  anonymized: boolean;
}

export interface MemberRow {
  id: number;
  denominationId: number;
  personId: number;
  congregationId: number;
  status: MemberStatus;
  joinedOn: string | null;
  isBaptized: boolean | null;
  waterBaptismOn: string | null;
  baptismPlace: string | null;
  previousCongregationName: string | null;
  pastoralRankId: number | null;
  notes: string | null;
}

interface RegistryRow {
  id: number;
  denominationId: number;
  memberId: number;
  congregationId: number;
  memberNumber: number;
  startedOn: string;
  endedOn: string | null;
}

interface PositionRow {
  id: number;
  denominationId: number;
  memberId: number;
  positionId: number;
  startedOn: string | null;
  endedOn: string | null;
}

interface FamilyRow extends FamilyRelationRow {
  denominationId: number;
}

interface StudyRow {
  id: number;
  denominationId: number;
  personId: number;
  name: string;
  studyTypeId: number;
  institution: string | null;
  status: 'IN_PROGRESS' | 'COMPLETED';
  year: number | null;
}

interface ConsentData {
  id: number;
  denominationId: number;
  personId: number;
  guardianId: number | null;
  policyId: number;
  channel: 'WEB_FORM' | 'PAPER';
  grantedAt: Date;
  revokedAt: Date | null;
}

interface CatalogRow {
  id: number;
  denominationId: number;
  name: string;
  isActive: boolean;
}

export interface CongregationData {
  id: number;
  denominationId: number;
  name: string;
  code: string;
  isActive: boolean;
}

export interface PolicyRow {
  id: number;
  denominationId: number;
  version: string;
  effectiveFrom: string;
  published: boolean;
}

export interface TransferData extends NewTransferRecord {
  id: number;
  denominationId: number;
}

export interface HistoryData {
  id: number;
  denominationId: number;
  memberId: number;
  status: MemberStatus;
  startedOn: string;
  reason: string | null;
  userId: number | null;
}

/** The shared tables. Every fake repository reads and writes here. */
export class MembershipStore {
  private sequence = 100;
  persons: PersonRow[] = [];
  members: MemberRow[] = [];
  registry: RegistryRow[] = [];
  histories: HistoryData[] = [];
  transfers: TransferData[] = [];
  positions: PositionRow[] = [];
  family: FamilyRow[] = [];
  studies: StudyRow[] = [];
  consents: ConsentData[] = [];
  policies: PolicyRow[] = [];
  profiles: (SocioeconomicProfileData & {
    personId: number;
    denominationId: number;
  })[] = [];
  positionCatalog: CatalogRow[] = [];
  rankCatalog: CatalogRow[] = [];
  congregations: CongregationData[] = [];
  marriagePersonIds = new Set<number>();
  audit: AuditEntry[] = [];
  /** Operations applied inside a transaction that was rolled back must not be visible. */
  transactionsRun = 0;

  nextId(): number {
    this.sequence += 1;
    return this.sequence;
  }

  codeOf(memberId: number): string {
    const entries = this.registry
      .filter((entry) => entry.memberId === memberId)
      .sort((a, b) => b.startedOn.localeCompare(a.startedOn) || b.id - a.id);
    const entry = entries[0];
    const congregation = this.congregations.find(
      (item) => item.id === entry?.congregationId,
    );
    return entry && congregation
      ? formatMemberCode(congregation.code, entry.memberNumber)
      : '—';
  }

  inScope(
    scope: TenantScope,
    row: { denominationId: number; congregationId?: number },
  ): boolean {
    return (
      row.denominationId === scope.denominationId &&
      (scope.congregationId === null ||
        row.congregationId === scope.congregationId)
    );
  }

  member(scope: TenantScope, memberId: number): MemberRow | undefined {
    return this.members.find(
      (row) => row.id === memberId && this.inScope(scope, row),
    );
  }

  person(scope: TenantScope, personId: number): PersonRow | undefined {
    return this.persons.find(
      (row) =>
        row.id === personId && row.denominationId === scope.denominationId,
    );
  }

  seedCongregation(
    id: number,
    denominationId: number,
    code: string,
    isActive = true,
  ): CongregationData {
    const congregation = {
      id,
      denominationId,
      name: `Sede ${code}`,
      code,
      isActive,
    };
    this.congregations.push(congregation);
    return congregation;
  }

  seedPerson(
    overrides: Partial<PersonRow> & { denominationId: number },
  ): PersonRow {
    const id = overrides.id ?? this.nextId();
    const row: PersonRow = {
      id,
      userId: null,
      firstName: `Nombre${id}`,
      lastName: `Apellido${id}`,
      secondLastName: null,
      sex: null,
      birthDate: '1990-05-20',
      documentTypeId: 3,
      documentNumber: `1000${id}`,
      phone: null,
      email: null,
      address: null,
      anonymized: false,
      ...overrides,
    };
    this.persons.push(row);
    return row;
  }

  /** A person who is a member of the congregation, with registry entry number 1. */
  seedMember(
    denominationId: number,
    congregationId: number,
    overrides: Partial<MemberRow> & { person?: Partial<PersonRow> } = {},
  ): MemberRow {
    const person = this.seedPerson({ denominationId, ...overrides.person });
    const member: MemberRow = {
      id: overrides.id ?? this.nextId(),
      denominationId,
      personId: person.id,
      congregationId,
      status: 'ACTIVE',
      joinedOn: '2020-01-10',
      isBaptized: null,
      waterBaptismOn: null,
      baptismPlace: null,
      previousCongregationName: null,
      pastoralRankId: null,
      notes: null,
      ...overrides,
    };
    delete (member as Partial<MemberRow> & { person?: unknown }).person;
    this.members.push(member);
    this.registry.push({
      id: this.nextId(),
      denominationId,
      memberId: member.id,
      congregationId,
      memberNumber:
        this.registry.filter((e) => e.congregationId === congregationId)
          .length + 1,
      startedOn: '2020-01-10',
      endedOn: null,
    });
    return member;
  }
}

export class FakeTransactionRunner implements TransactionRunner {
  readonly handle: Transaction = { kind: 'transaction' };
  constructor(private readonly store: MembershipStore) {}

  async run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    this.store.transactionsRun += 1;
    return work(this.handle);
  }
}

export class FakeAuditRecorder implements AuditRecorder {
  constructor(private readonly store: MembershipStore) {}

  record(entry: AuditEntry): Promise<void> {
    this.store.audit.push(entry);
    return Promise.resolve();
  }
}

class FakeSequenceStore implements DocumentSequenceStore {
  private readonly counters = new Map<string, number>();

  next(scope: TenantScope, key: string): Promise<number> {
    const id = `${scope.denominationId}/${scope.congregationId}/${key}`;
    const value = (this.counters.get(id) ?? 0) + 1;
    this.counters.set(id, value);
    return Promise.resolve(value);
  }
}

export function fakeNumbering(
  store: MembershipStore,
): DocumentNumberingService {
  return new DocumentNumberingService(
    new FakeSequenceStore(),
    new FakeTransactionRunner(store),
  );
}

export class FakeMemberRepository implements MemberRepository {
  constructor(private readonly store: MembershipStore) {}

  list(
    scope: TenantScope,
    criteria: MemberListCriteria,
    paging: { page: number; pageSize: number },
  ): Promise<MemberListResult> {
    const base = this.rows(scope, { ...criteria, status: 'ALL' });
    const counts: Record<'ALL' | MemberStatus, number> = {
      ALL: base.length,
      ACTIVE: 0,
      INACTIVE: 0,
      TRANSFERRED: 0,
      DECEASED: 0,
    };
    for (const row of base) {
      counts[row.status] += 1;
    }
    const filtered =
      criteria.status === 'ALL'
        ? base
        : base.filter((row) => row.status === criteria.status);
    const start = (paging.page - 1) * paging.pageSize;
    return Promise.resolve({
      rows: filtered.slice(start, start + paging.pageSize),
      total: filtered.length,
      statusCounts: counts,
    });
  }

  listForExport(
    scope: TenantScope,
    criteria: MemberListCriteria,
    limit: number,
  ): Promise<MemberListRow[]> {
    return Promise.resolve(this.rows(scope, criteria).slice(0, limit));
  }

  private rows(
    scope: TenantScope,
    criteria: MemberListCriteria,
  ): MemberListRow[] {
    return this.store.members
      .filter((member) => this.store.inScope(scope, member))
      .filter(
        (member) =>
          criteria.congregationId === null ||
          member.congregationId === criteria.congregationId,
      )
      .flatMap((member) => {
        const person = this.store.persons.find(
          (row) => row.id === member.personId,
        );
        if (!person) {
          return [];
        }
        const text = criteria.text.toLowerCase();
        const name = `${person.firstName} ${person.lastName}`.toLowerCase();
        const matches =
          text === '' ||
          name.includes(text) ||
          (person.documentNumber ?? '').toLowerCase().includes(text);
        const bornAfter =
          criteria.bornOnOrAfter === null ||
          (person.birthDate !== null &&
            person.birthDate >= criteria.bornOnOrAfter);
        const bornBefore =
          criteria.bornOnOrBefore === null ||
          (person.birthDate !== null &&
            person.birthDate <= criteria.bornOnOrBefore);
        if (
          !matches ||
          !bornAfter ||
          !bornBefore ||
          (criteria.status !== 'ALL' && member.status !== criteria.status) ||
          (criteria.sex !== 'ALL' && person.sex !== criteria.sex)
        ) {
          return [];
        }
        const congregation = this.store.congregations.find(
          (item) => item.id === member.congregationId,
        );
        return [
          {
            id: member.id,
            code: this.store.codeOf(member.id),
            fullName: `${person.firstName} ${person.lastName}`,
            sex: person.sex,
            documentTypeCode: person.documentTypeId === null ? null : 'CC',
            documentNumber: person.documentNumber,
            birthDate: person.birthDate,
            phone: person.phone,
            joinedOn: member.joinedOn,
            status: member.status,
            congregationId: member.congregationId,
            congregationName: congregation?.name ?? '—',
            positions: this.store.positions
              .filter(
                (row) => row.memberId === member.id && row.endedOn === null,
              )
              .map(
                (row) =>
                  this.store.positionCatalog.find(
                    (p) => p.id === row.positionId,
                  )?.name ?? '—',
              ),
          },
        ];
      });
  }

  findDetail(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberDetail | null> {
    const member = this.store.member(scope, memberId);
    const person =
      member && this.store.persons.find((row) => row.id === member.personId);
    if (!member || !person) {
      return Promise.resolve(null);
    }
    const congregation = this.store.congregations.find(
      (item) => item.id === member.congregationId,
    );
    return Promise.resolve({
      id: member.id,
      code: this.store.codeOf(member.id),
      status: member.status,
      joinedOn: member.joinedOn,
      isBaptized: member.isBaptized,
      waterBaptismOn: member.waterBaptismOn,
      baptismPlace: member.baptismPlace,
      previousCongregationName: member.previousCongregationName,
      congregationId: member.congregationId,
      congregationName: congregation?.name ?? '—',
      congregationMunicipalityCode: null,
      person: {
        id: person.id,
        denominationId: person.denominationId,
        userId: person.userId,
        documentTypeCode: person.documentTypeId === null ? null : 'CC',
        documentNumber: person.documentNumber,
        firstName: person.firstName,
        lastName: person.lastName,
        secondLastName: person.secondLastName,
        sex: person.sex,
        birthDate: person.birthDate,
        maritalStatusCode: null,
        educationLevelCode: null,
        profession: null,
        occupation: null,
        phone: person.phone,
        email: person.email,
        address: person.address,
        municipalityCode: null,
      },
    });
  }

  findReference(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberReference | null> {
    const member = this.store.member(scope, memberId);
    return Promise.resolve(
      member
        ? {
            id: member.id,
            personId: member.personId,
            congregationId: member.congregationId,
            status: member.status,
            pastoralRankId: member.pastoralRankId,
          }
        : null,
    );
  }

  insert(scope: TenantScope, record: NewMemberRecord): Promise<number> {
    const id = this.store.nextId();
    this.store.members.push({
      id,
      denominationId: scope.denominationId,
      personId: record.personId,
      congregationId: record.congregationId,
      status: 'ACTIVE',
      joinedOn: record.joinedOn,
      isBaptized: record.isBaptized,
      waterBaptismOn: record.waterBaptismOn,
      baptismPlace: record.baptismPlace,
      previousCongregationName: record.previousCongregationName,
      pastoralRankId: null,
      notes: null,
    });
    return Promise.resolve(id);
  }

  updateMembershipData(
    scope: TenantScope,
    memberId: number,
    patch: MembershipDataPatch,
  ): Promise<void> {
    const member = this.required(scope, memberId);
    Object.assign(member, patch);
    return Promise.resolve();
  }

  updateStatus(
    scope: TenantScope,
    memberId: number,
    status: MemberStatus,
  ): Promise<void> {
    this.required(scope, memberId).status = status;
    return Promise.resolve();
  }

  updateCongregation(
    scope: TenantScope,
    memberId: number,
    congregationId: number,
  ): Promise<void> {
    this.required(scope, memberId).congregationId = congregationId;
    return Promise.resolve();
  }

  updatePastoralRank(
    scope: TenantScope,
    memberId: number,
    pastoralRankId: number | null,
  ): Promise<void> {
    this.required(scope, memberId).pastoralRankId = pastoralRankId;
    return Promise.resolve();
  }

  clearNotes(scope: TenantScope, memberId: number): Promise<void> {
    this.required(scope, memberId).notes = null;
    return Promise.resolve();
  }

  private required(scope: TenantScope, memberId: number): MemberRow {
    const member = this.store.member(scope, memberId);
    if (!member) {
      throw new Error('member not in scope');
    }
    return member;
  }
}

export class FakePersonRepository implements PersonRepository {
  constructor(private readonly store: MembershipStore) {}

  findExisting(
    scope: TenantScope,
    personId: number,
  ): Promise<ExistingPerson | null> {
    const person = this.store.person(scope, personId);
    return Promise.resolve(person ? this.toExisting(person) : null);
  }

  findByDocument(
    scope: TenantScope,
    documentTypeId: number,
    documentNumber: string,
    exceptPersonId: number | null,
  ): Promise<ExistingPerson | null> {
    const person = this.store.persons.find(
      (row) =>
        row.denominationId === scope.denominationId &&
        row.documentTypeId === documentTypeId &&
        row.documentNumber === documentNumber &&
        row.id !== exceptPersonId,
    );
    return Promise.resolve(person ? this.toExisting(person) : null);
  }

  insert(scope: TenantScope, data: ResolvedPersonData): Promise<number> {
    const row = this.store.seedPerson({
      denominationId: scope.denominationId,
      firstName: data.firstName,
      lastName: data.lastName,
      secondLastName: data.secondLastName,
      sex: data.sex,
      birthDate: data.birthDate,
      documentTypeId: data.documentTypeId,
      documentNumber: data.documentNumber,
      phone: data.phone,
      email: data.email,
      address: data.address,
    });
    return Promise.resolve(row.id);
  }

  update(
    scope: TenantScope,
    personId: number,
    data: ResolvedPersonData,
  ): Promise<void> {
    const person = this.store.person(scope, personId);
    if (!person) {
      throw new Error('person not in scope');
    }
    Object.assign(person, {
      firstName: data.firstName,
      lastName: data.lastName,
      secondLastName: data.secondLastName,
      sex: data.sex,
      birthDate: data.birthDate,
      documentTypeId: data.documentTypeId,
      documentNumber: data.documentNumber,
      phone: data.phone,
      email: data.email,
      address: data.address,
    });
    return Promise.resolve();
  }

  anonymize(scope: TenantScope, personId: number): Promise<void> {
    const person = this.store.person(scope, personId);
    if (person) {
      Object.assign(person, {
        firstName: 'Persona',
        lastName: 'anonimizada',
        secondLastName: null,
        documentTypeId: null,
        documentNumber: null,
        birthDate: null,
        phone: null,
        email: null,
        address: null,
        anonymized: true,
      });
    }
    return Promise.resolve();
  }

  private toExisting(person: PersonRow): ExistingPerson {
    const member = this.store.members.find((row) => row.personId === person.id);
    return {
      id: person.id,
      userId: person.userId,
      sex: person.sex,
      birthDate: person.birthDate,
      hasMember: member !== undefined,
      memberStatus: member?.status ?? null,
    };
  }
}

export class FakeCatalogResolver implements CatalogResolver {
  resolve(codes: CatalogCodes): Promise<CatalogResolution> {
    const known = { CC: 3, TI: 2, RC: 1 } as Record<string, number>;
    const unknown: CatalogResolution['unknown'][number][] = [];
    let documentTypeId: number | null = null;
    if (codes.documentTypeCode !== null) {
      documentTypeId = known[codes.documentTypeCode] ?? null;
      if (documentTypeId === null) {
        unknown.push('documentType');
      }
    }
    return Promise.resolve({
      ids: {
        documentTypeId,
        maritalStatusId: codes.maritalStatusCode === null ? null : 1,
        educationLevelId: codes.educationLevelCode === null ? null : 1,
        municipalityId: codes.municipalityCode === null ? null : 1,
      },
      unknown,
    });
  }

  studyTypeId(code: string): Promise<number | null> {
    return Promise.resolve(code === 'COURSE' ? 1 : null);
  }
}

export class FakeFamilyRepository implements FamilyRepository {
  constructor(private readonly store: MembershipStore) {}

  list(scope: TenantScope, personId: number): Promise<FamilyRelationView[]> {
    return Promise.resolve(
      this.store.family
        .filter(
          (row) =>
            row.personId === personId &&
            row.denominationId === scope.denominationId,
        )
        .map((row) => {
          const relative = this.store.persons.find(
            (item) => item.id === row.relativeId,
          );
          const member = this.store.members.find(
            (item) =>
              item.personId === row.relativeId &&
              this.store.inScope(scope, item),
          );
          return {
            id: row.id,
            type: row.type,
            relativeId: row.relativeId,
            fullName: `${relative?.firstName} ${relative?.lastName}`,
            documentTypeCode: 'CC',
            maskedDocument: maskDocument(
              'CC',
              relative?.documentNumber ?? null,
            ),
            age: ageOn(relative?.birthDate ?? null, TODAY),
            memberId: member?.id ?? null,
            memberCode: member ? this.store.codeOf(member.id) : null,
            congregationName: null,
            memberStatus: member?.status ?? null,
          };
        }),
    );
  }

  rowsOf(scope: TenantScope, personId: number): Promise<FamilyRelationRow[]> {
    return Promise.resolve(
      this.store.family.filter(
        (row) =>
          row.personId === personId &&
          row.denominationId === scope.denominationId,
      ),
    );
  }

  add(
    scope: TenantScope,
    personId: number,
    relativeId: number,
    type: FamilyRelationType,
  ): Promise<number> {
    const id = this.store.nextId();
    this.store.family.push({
      id,
      denominationId: scope.denominationId,
      personId,
      relativeId,
      type,
    });
    return Promise.resolve(id);
  }

  updateType(
    scope: TenantScope,
    relationId: number,
    type: FamilyRelationType,
  ): Promise<void> {
    const index = this.store.family.findIndex(
      (item) =>
        item.id === relationId && item.denominationId === scope.denominationId,
    );
    if (index >= 0) {
      this.store.family[index] = { ...this.store.family[index], type };
    }
    return Promise.resolve();
  }

  createRelativePerson(
    scope: TenantScope,
    input: {
      firstName: string;
      lastName: string | null;
      secondLastName: string | null;
      sex: Sex | null;
      birthDate: string | null;
    },
  ): Promise<number> {
    const person = this.store.seedPerson({
      denominationId: scope.denominationId,
      firstName: input.firstName,
      lastName: input.lastName ?? '',
      secondLastName: input.secondLastName,
      sex: input.sex,
      birthDate: input.birthDate,
      documentTypeId: null,
      documentNumber: null,
    });
    return Promise.resolve(person.id);
  }

  updateRelativePerson(
    scope: TenantScope,
    relativeId: number,
    input: {
      firstName: string;
      lastName: string | null;
      secondLastName: string | null;
      sex: Sex | null;
      birthDate: string | null;
    },
  ): Promise<void> {
    const person = this.store.persons.find(
      (item) =>
        item.id === relativeId && item.denominationId === scope.denominationId,
    );
    if (!person) {
      return Promise.resolve();
    }
    const member = this.store.members.find(
      (item) => item.personId === relativeId,
    );
    if (
      scope.congregationId !== null &&
      member &&
      member.congregationId !== scope.congregationId
    ) {
      return Promise.resolve();
    }
    person.firstName = input.firstName;
    person.lastName = input.lastName ?? '';
    person.secondLastName = input.secondLastName;
    person.sex = input.sex;
    person.birthDate = input.birthDate;
    return Promise.resolve();
  }

  remove(scope: TenantScope, relationId: number): Promise<void> {
    this.store.family = this.store.family.filter(
      (row) =>
        !(row.id === relationId && row.denominationId === scope.denominationId),
    );
    return Promise.resolve();
  }
}

export class FakeStudyRepository implements StudyRepository {
  constructor(private readonly store: MembershipStore) {}

  list(scope: TenantScope, personId: number): Promise<PersonStudyView[]> {
    return Promise.resolve(
      this.store.studies
        .filter(
          (row) =>
            row.personId === personId &&
            row.denominationId === scope.denominationId,
        )
        .map((row) => ({
          id: row.id,
          studyTypeCode: 'COURSE',
          name: row.name,
          institution: row.institution,
          status: row.status,
          year: row.year,
        })),
    );
  }

  add(
    scope: TenantScope,
    personId: number,
    record: NewStudyRecord,
  ): Promise<number | null> {
    const duplicate = this.store.studies.some(
      (row) =>
        row.personId === personId &&
        row.denominationId === scope.denominationId &&
        row.studyTypeId === record.studyTypeId &&
        row.name === record.name,
    );
    if (duplicate) {
      return Promise.resolve(null);
    }
    const id = this.store.nextId();
    this.store.studies.push({
      id,
      denominationId: scope.denominationId,
      personId,
      ...record,
    });
    return Promise.resolve(id);
  }

  remove(
    scope: TenantScope,
    personId: number,
    personStudyId: number,
  ): Promise<boolean> {
    const before = this.store.studies.length;
    this.store.studies = this.store.studies.filter(
      (row) =>
        !(
          row.id === personStudyId &&
          row.personId === personId &&
          row.denominationId === scope.denominationId
        ),
    );
    return Promise.resolve(this.store.studies.length < before);
  }
}

export class FakePositionRepository implements PositionRepository {
  constructor(private readonly store: MembershipStore) {}

  positionsOf(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberPositionRow[]> {
    return Promise.resolve(
      this.store.positions
        .filter(
          (row) =>
            row.memberId === memberId &&
            row.denominationId === scope.denominationId,
        )
        .map((row) => this.view(row)),
    );
  }

  async openPositionsOf(
    scope: TenantScope,
    memberId: number,
  ): Promise<MemberPositionRow[]> {
    return (await this.positionsOf(scope, memberId)).filter(
      (row) => row.endedOn === null,
    );
  }

  async findRow(
    scope: TenantScope,
    memberId: number,
    memberPositionId: number,
  ): Promise<MemberPositionRow | null> {
    return (
      (await this.positionsOf(scope, memberId)).find(
        (row) => row.id === memberPositionId,
      ) ?? null
    );
  }

  positionCatalog(scope: TenantScope): Promise<CatalogItem[]> {
    return Promise.resolve(
      this.store.positionCatalog.filter(
        (row) => row.denominationId === scope.denominationId,
      ),
    );
  }

  rankCatalog(scope: TenantScope): Promise<CatalogItem[]> {
    return Promise.resolve(
      this.store.rankCatalog.filter(
        (row) => row.denominationId === scope.denominationId,
      ),
    );
  }

  add(
    scope: TenantScope,
    memberId: number,
    positionId: number,
    startedOn: string,
  ): Promise<number> {
    const id = this.store.nextId();
    this.store.positions.push({
      id,
      denominationId: scope.denominationId,
      memberId,
      positionId,
      startedOn,
      endedOn: null,
    });
    return Promise.resolve(id);
  }

  close(
    scope: TenantScope,
    memberPositionId: number,
    endedOn: string,
  ): Promise<void> {
    const row = this.store.positions.find(
      (item) =>
        item.id === memberPositionId &&
        item.denominationId === scope.denominationId,
    );
    if (row) {
      row.endedOn = endedOn;
    }
    return Promise.resolve();
  }

  private view(row: PositionRow): MemberPositionRow {
    return {
      id: row.id,
      memberId: row.memberId,
      positionId: row.positionId,
      positionName:
        this.store.positionCatalog.find((p) => p.id === row.positionId)?.name ??
        '—',
      startedOn: row.startedOn,
      endedOn: row.endedOn,
    };
  }
}

export class FakeSocioeconomicRepository implements SocioeconomicRepository {
  constructor(private readonly store: MembershipStore) {}

  find(
    scope: TenantScope,
    personId: number,
  ): Promise<SocioeconomicProfileView | null> {
    const row = this.store.profiles.find(
      (item) =>
        item.personId === personId &&
        item.denominationId === scope.denominationId,
    );
    return Promise.resolve(
      row ? { ...row, updatedAt: '2026-11-02T15:00:00.000Z' } : null,
    );
  }

  save(
    scope: TenantScope,
    personId: number,
    data: SocioeconomicProfileData,
  ): Promise<SocioeconomicProfileView> {
    this.store.profiles = this.store.profiles.filter(
      (item) =>
        !(
          item.personId === personId &&
          item.denominationId === scope.denominationId
        ),
    );
    const row = { ...data, personId, denominationId: scope.denominationId };
    this.store.profiles.push(row);
    return Promise.resolve({
      ...data,
      personId,
      updatedAt: '2026-11-02T15:00:00.000Z',
    });
  }
}

export class FakeRegistryRepository implements RegistryRepository {
  constructor(private readonly store: MembershipStore) {}

  view(scope: TenantScope, memberId: number): Promise<MemberRegistryView> {
    return Promise.resolve({
      entries: this.store.registry
        .filter(
          (row) =>
            row.memberId === memberId &&
            row.denominationId === scope.denominationId,
        )
        .map((row) => {
          const congregation = this.store.congregations.find(
            (c) => c.id === row.congregationId,
          );
          return {
            id: row.id,
            congregationId: row.congregationId,
            congregationName: congregation?.name ?? '—',
            memberNumber: row.memberNumber,
            code: formatMemberCode(congregation?.code ?? '?', row.memberNumber),
            registryBook: null,
            registryFolio: null,
            startedOn: row.startedOn,
            endedOn: row.endedOn,
          };
        }),
      transfers: [],
      statusHistory: this.store.histories
        .filter(
          (row) =>
            row.memberId === memberId &&
            row.denominationId === scope.denominationId,
        )
        .map((row) => ({
          id: row.id,
          status: row.status,
          startedOn: row.startedOn,
          reason: row.reason,
          changedBy: null,
        })),
    });
  }

  currentEntry(
    scope: TenantScope,
    memberId: number,
  ): Promise<CurrentRegistryEntry | null> {
    const row = this.store.registry.find(
      (item) =>
        item.memberId === memberId &&
        item.denominationId === scope.denominationId &&
        item.endedOn === null,
    );
    return Promise.resolve(
      row
        ? {
            id: row.id,
            congregationId: row.congregationId,
            memberNumber: row.memberNumber,
            startedOn: row.startedOn,
          }
        : null,
    );
  }

  openEntry(scope: TenantScope, entry: NewRegistryEntry): Promise<number> {
    const id = this.store.nextId();
    this.store.registry.push({
      id,
      denominationId: scope.denominationId,
      memberId: entry.memberId,
      congregationId: entry.congregationId,
      memberNumber: entry.memberNumber,
      startedOn: entry.startedOn,
      endedOn: null,
    });
    return Promise.resolve(id);
  }

  closeCurrentEntry(
    scope: TenantScope,
    memberId: number,
    endedOn: string,
  ): Promise<void> {
    const row = this.store.registry.find(
      (item) =>
        item.memberId === memberId &&
        item.denominationId === scope.denominationId &&
        item.endedOn === null,
    );
    if (row) {
      row.endedOn = endedOn;
    }
    return Promise.resolve();
  }

  addStatusHistory(
    scope: TenantScope,
    entry: Omit<HistoryData, 'id' | 'denominationId'>,
  ): Promise<void> {
    this.store.histories.push({
      id: this.store.nextId(),
      denominationId: scope.denominationId,
      ...entry,
    });
    return Promise.resolve();
  }

  findCongregation(
    scope: TenantScope,
    congregationId: number,
  ): Promise<CongregationRef | null> {
    const row = this.store.congregations.find(
      (item) =>
        item.id === congregationId &&
        item.denominationId === scope.denominationId,
    );
    return Promise.resolve(
      row
        ? {
            id: row.id,
            name: row.name,
            code: row.code,
            municipalityCode: null,
            isActive: row.isActive,
          }
        : null,
    );
  }

  listDestinations(
    scope: TenantScope,
    exceptCongregationId: number,
  ): Promise<CongregationRef[]> {
    return Promise.resolve(
      this.store.congregations
        .filter(
          (item) =>
            item.denominationId === scope.denominationId &&
            item.isActive &&
            item.id !== exceptCongregationId,
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          code: item.code,
          municipalityCode: null,
          isActive: true,
        })),
    );
  }

  addTransfer(scope: TenantScope, record: NewTransferRecord): Promise<number> {
    const id = this.store.nextId();
    this.store.transfers.push({
      id,
      denominationId: scope.denominationId,
      ...record,
    });
    return Promise.resolve(id);
  }
}

export class FakeConsentRepository implements ConsentRepository {
  constructor(private readonly store: MembershipStore) {}

  list(scope: TenantScope, personId: number): Promise<ConsentView[]> {
    return Promise.resolve(
      this.store.consents
        .filter(
          (row) =>
            row.personId === personId &&
            row.denominationId === scope.denominationId,
        )
        .map((row) => {
          const policy = this.store.policies.find(
            (item) => item.id === row.policyId,
          );
          return {
            id: row.id,
            policyVersion: policy?.version ?? '—',
            policyEffectiveFrom: policy?.effectiveFrom ?? null,
            channel: row.channel,
            grantedAt: row.grantedAt.toISOString(),
            revokedAt: row.revokedAt?.toISOString() ?? null,
            guardianName: null,
          };
        }),
    );
  }

  find(
    scope: TenantScope,
    personId: number,
    consentId: number,
  ): Promise<ConsentRow | null> {
    const row = this.store.consents.find(
      (item) =>
        item.id === consentId &&
        item.personId === personId &&
        item.denominationId === scope.denominationId,
    );
    return Promise.resolve(
      row
        ? {
            id: row.id,
            personId: row.personId,
            revokedAt: row.revokedAt?.toISOString() ?? null,
          }
        : null,
    );
  }

  countInForce(scope: TenantScope, personId: number): Promise<number> {
    return Promise.resolve(
      this.store.consents.filter(
        (row) =>
          row.personId === personId &&
          row.denominationId === scope.denominationId &&
          row.revokedAt === null,
      ).length,
    );
  }

  countAll(scope: TenantScope, personId: number): Promise<number> {
    return Promise.resolve(
      this.store.consents.filter(
        (row) =>
          row.personId === personId &&
          row.denominationId === scope.denominationId,
      ).length,
    );
  }

  revoke(
    scope: TenantScope,
    consentId: number,
    revokedAt: Date,
  ): Promise<void> {
    const row = this.store.consents.find(
      (item) =>
        item.id === consentId && item.denominationId === scope.denominationId,
    );
    if (row) {
      row.revokedAt = revokedAt;
    }
    return Promise.resolve();
  }

  currentPolicy(
    scope: TenantScope,
    today: string,
  ): Promise<PrivacyPolicyRef | null> {
    const policy = this.store.policies
      .filter(
        (item) =>
          item.denominationId === scope.denominationId &&
          item.published &&
          item.effectiveFrom <= today,
      )
      .sort((a, b) => b.id - a.id)[0];
    return Promise.resolve(
      policy ? { id: policy.id, version: policy.version } : null,
    );
  }

  grant(scope: TenantScope, record: NewConsentRecord): Promise<number> {
    const id = this.store.nextId();
    this.store.consents.push({
      id,
      denominationId: scope.denominationId,
      revokedAt: null,
      ...record,
    });
    return Promise.resolve(id);
  }
}

/** Search over the store, with the same visibility rules as the Prisma repository. */
export class FakePeopleSearchRepository implements PeopleSearchRepository {
  constructor(private readonly store: MembershipStore) {}

  search(
    scope: TenantScope,
    criteria: PersonSearchCriteria,
  ): Promise<PersonSearchRow[]> {
    const query = criteria.query.toLowerCase();
    const rows = this.store.persons
      .filter((person) => person.denominationId === scope.denominationId)
      .filter((person) => person.id !== criteria.excludePersonId)
      .flatMap((person) => {
        const member = this.store.members.find(
          (item) => item.personId === person.id,
        );
        if (!this.visible(scope, criteria, member)) {
          return [];
        }
        const haystack =
          `${person.firstName} ${person.lastName} ${person.documentNumber ?? ''}`.toLowerCase();
        if (!haystack.includes(query) || !this.bornInWindow(person, criteria)) {
          return [];
        }
        const congregation = this.store.congregations.find(
          (item) => item.id === member?.congregationId,
        );
        return [
          {
            personId: person.id,
            fullName: `${person.firstName} ${person.lastName}`,
            documentTypeCode: person.documentTypeId === null ? null : 'CC',
            documentNumber: person.documentNumber,
            sex: person.sex,
            birthDate: person.birthDate,
            memberId: member?.id ?? null,
            memberCode: member ? this.store.codeOf(member.id) : null,
            memberStatus: member?.status ?? null,
            congregationId: member?.congregationId ?? null,
            congregationName: congregation?.name ?? null,
            isBaptized: member?.isBaptized ?? null,
            waterBaptismOn: member?.waterBaptismOn ?? null,
            joinedOn: member?.joinedOn ?? null,
            hasActiveMarriage: this.store.marriagePersonIds.has(person.id),
          },
        ];
      });
    return Promise.resolve(rows.slice(0, criteria.limit));
  }

  private visible(
    scope: TenantScope,
    criteria: PersonSearchCriteria,
    member: MemberRow | undefined,
  ): boolean {
    switch (criteria.purpose) {
      case 'MEMBER_LOOKUP':
        return (
          member !== undefined &&
          member.status === 'ACTIVE' &&
          member.congregationId === scope.congregationId
        );
      case 'FAMILY_CANDIDATE':
        return true;
      case 'UNLINKED_PERSON':
        return member === undefined;
      case 'CONTRIBUTOR':
        return member !== undefined && member.status !== 'DECEASED';
      case 'SECRETARIAT':
        return (
          scope.congregationId === null ||
          member === undefined ||
          member.congregationId === scope.congregationId
        );
    }
  }

  private bornInWindow(
    person: PersonRow,
    criteria: PersonSearchCriteria,
  ): boolean {
    if (person.birthDate === null) {
      return criteria.includeUnknownBirthDate;
    }
    return (
      (criteria.bornOnOrAfter === null ||
        person.birthDate >= criteria.bornOnOrAfter) &&
      (criteria.bornOnOrBefore === null ||
        person.birthDate <= criteria.bornOnOrBefore)
    );
  }
}

/** Everything a use case test needs, wired on one store. */
export function buildMembershipFakes() {
  const store = new MembershipStore();
  store.seedCongregation(10, 1, 'SC');
  store.seedCongregation(11, 1, 'SN');
  store.seedCongregation(20, 2, 'OT');
  return {
    store,
    members: new FakeMemberRepository(store),
    persons: new FakePersonRepository(store),
    catalogs: new FakeCatalogResolver(),
    family: new FakeFamilyRepository(store),
    studies: new FakeStudyRepository(store),
    positions: new FakePositionRepository(store),
    profiles: new FakeSocioeconomicRepository(store),
    registry: new FakeRegistryRepository(store),
    consents: new FakeConsentRepository(store),
    search: new FakePeopleSearchRepository(store),
    transactions: new FakeTransactionRunner(store),
    audit: new FakeAuditRecorder(store),
    numbering: fakeNumbering(store),
    clock: new FixedClock(),
  };
}

export type MembershipFakes = ReturnType<typeof buildMembershipFakes>;
