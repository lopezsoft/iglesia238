import type {
  Transaction,
  TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import { normalizeDocumentNumber } from '../../../../common/people/document-number.js';
import type { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import {
  countByFilter,
  FILTER_STATUSES,
  type ApplicationStatus,
} from '../../domain/application-status.js';
import { parseFormData } from '../../domain/application-form-data.js';
import type {
  ApplicationChange,
  ApplicationListQuery,
  ApplicationListResult,
  ApplicationRecord,
  ApplicationsRepository,
} from '../ports/applications.repository.js';
import type {
  DocumentRef,
  ExistingPerson,
  MemberReactivation,
  MembershipRegistry,
  MemberStatusValue,
  NewConsent,
  NewMember,
  NewRegistryEntry,
  PersonData,
  StatusRecord,
} from '../ports/membership-registry.port.js';

export interface PersonRow extends PersonData {
  id: number;
  denominationId: number;
}

export interface MemberRow {
  id: number;
  denominationId: number;
  personId: number;
  congregationId: number;
  status: MemberStatusValue;
  joinedOn: string;
  previousCongregationName: string | null;
  isBaptized: boolean | null;
}

export interface RegistryRow extends NewRegistryEntry {
  denominationId: number;
  endedOn: string | null;
}

export interface ConsentRow extends NewConsent {
  denominationId: number;
}

export interface RelationRow {
  denominationId: number;
  personId: number;
  relativeId: number;
}

export interface StatusHistoryRow extends StatusRecord {
  denominationId: number;
}

export const CONGREGATION_NAMES: Record<
  number,
  { name: string; code: string }
> = {
  10: { name: 'Sede Central', code: 'SC' },
  11: { name: 'Sede Norte', code: 'SN' },
  20: { name: 'Sede Otra Denominación', code: 'SO' },
};

/** All the state the approval touches, so one snapshot can be restored when a step fails. */
export class World {
  applications: ApplicationRecord[] = [];
  people: PersonRow[] = [];
  members: MemberRow[] = [];
  entries: RegistryRow[] = [];
  histories: StatusHistoryRow[] = [];
  consents: ConsentRow[] = [];
  relations: RelationRow[] = [];
  nextId = 100;

  /** Makes the next call to the named registry method fail, to prove that a transaction rolls back. */
  failOn: keyof MembershipRegistry | null = null;

  id(): number {
    this.nextId += 1;
    return this.nextId;
  }

  snapshot(): string {
    return JSON.stringify(this.state());
  }

  restore(snapshot: string): void {
    const state = JSON.parse(snapshot) as ReturnType<World['state']>;
    this.applications = state.applications.map((application) => ({
      ...application,
      consentedAt: new Date(application.consentedAt),
      createdAt: new Date(application.createdAt),
      reviewedAt: application.reviewedAt
        ? new Date(application.reviewedAt)
        : null,
    }));
    this.people = state.people;
    this.members = state.members;
    this.entries = state.entries;
    this.histories = state.histories;
    this.consents = state.consents.map((consent) => ({
      ...consent,
      grantedAt: new Date(consent.grantedAt),
    }));
    this.relations = state.relations;
    this.nextId = state.nextId;
  }

  private state() {
    return {
      applications: this.applications,
      people: this.people,
      members: this.members,
      entries: this.entries,
      histories: this.histories,
      consents: this.consents,
      relations: this.relations,
      nextId: this.nextId,
    };
  }
}

/** Commits on success and restores the previous state when the work throws, like a database would. */
export class RollbackTransactionRunner implements TransactionRunner {
  constructor(private readonly world: World) {}

  async run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    const before = this.world.snapshot();
    try {
      return await work({ kind: 'transaction' });
    } catch (error) {
      this.world.restore(before);
      throw error;
    }
  }
}

function inScope(
  scope: TenantScope,
  row: { denominationId: number; congregationId: number },
): boolean {
  return (
    row.denominationId === scope.denominationId &&
    (scope.congregationId === null ||
      row.congregationId === scope.congregationId)
  );
}

export class FakeApplicationsRepository implements ApplicationsRepository {
  constructor(private readonly world: World) {}

  list(
    scope: TenantScope,
    query: ApplicationListQuery,
  ): Promise<ApplicationListResult> {
    const visible = this.world.applications.filter(
      (application) =>
        inScope(scope, application) &&
        (query.congregationId === null ||
          application.congregationId === query.congregationId),
    );
    const byStatus: Partial<Record<ApplicationStatus, number>> = {};
    for (const application of visible) {
      byStatus[application.status] = (byStatus[application.status] ?? 0) + 1;
    }
    const matching = visible
      .filter((application) =>
        FILTER_STATUSES[query.filter].includes(application.status),
      )
      .filter(
        (application) =>
          query.search === null ||
          `${application.firstName} ${application.lastName} ${application.documentNumber ?? ''}`
            .toLowerCase()
            .includes(query.search.toLowerCase()),
      )
      .sort((a, b) =>
        query.order === 'asc'
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime(),
      );
    const from = (query.page - 1) * query.pageSize;
    return Promise.resolve({
      items: matching.slice(from, from + query.pageSize).map((application) => ({
        id: application.id,
        congregationId: application.congregationId,
        congregationName: application.congregationName,
        status: application.status,
        firstName: application.firstName,
        lastName: application.lastName,
        secondLastName: application.formData.secondLastName,
        documentTypeCode: application.documentTypeCode,
        documentNumber: application.documentNumber,
        birthDate: application.birthDate,
        guardianName: application.guardianName,
        createdAt: application.createdAt,
      })),
      total: matching.length,
      counts: countByFilter(byStatus),
    });
  }

  findById(scope: TenantScope, id: number): Promise<ApplicationRecord | null> {
    const found = this.world.applications.find(
      (application) => application.id === id && inScope(scope, application),
    );
    return Promise.resolve(found ? { ...found } : null);
  }

  transition(
    scope: TenantScope,
    id: number,
    from: readonly ApplicationStatus[],
    change: ApplicationChange,
  ): Promise<boolean> {
    const found = this.world.applications.find(
      (application) => application.id === id && inScope(scope, application),
    );
    if (!found || !from.includes(found.status)) {
      return Promise.resolve(false);
    }
    found.status = change.status;
    found.reviewerId = change.reviewerId;
    found.reviewerName = `Revisor ${change.reviewerId}`;
    found.reviewedAt = change.reviewedAt;
    if (change.rejectionReason !== undefined) {
      found.rejectionReason = change.rejectionReason;
    }
    if (change.matchedPersonId !== undefined) {
      found.matchedPersonId = change.matchedPersonId;
    }
    return Promise.resolve(true);
  }

  attachMember(
    scope: TenantScope,
    id: number,
    memberId: number,
  ): Promise<void> {
    const found = this.world.applications.find(
      (application) => application.id === id && inScope(scope, application),
    );
    if (found) {
      found.memberId = memberId;
      found.memberNumber =
        this.world.entries.find(
          (entry) => entry.memberId === memberId && entry.endedOn === null,
        )?.memberNumber ?? null;
    }
    return Promise.resolve();
  }
}

export class FakeMembershipRegistry implements MembershipRegistry {
  constructor(private readonly world: World) {}

  private guard(method: keyof MembershipRegistry): void {
    if (this.world.failOn === method) {
      throw new Error(`Simulated failure in ${method}`);
    }
  }

  private view(person: PersonRow): ExistingPerson {
    const member = this.world.members.find((row) => row.personId === person.id);
    const entry = member
      ? this.world.entries.find(
          (row) => row.memberId === member.id && row.endedOn === null,
        )
      : undefined;
    const congregation = member
      ? CONGREGATION_NAMES[member.congregationId]
      : undefined;
    return {
      id: person.id,
      fullName: `${person.firstName} ${person.lastName}`,
      documentTypeCode: person.documentTypeCode,
      documentNumber: person.documentNumber,
      member: member
        ? {
            id: member.id,
            status: member.status,
            congregationId: member.congregationId,
            congregationName: congregation?.name ?? '',
            congregationCode: congregation?.code ?? 'XX',
            memberNumber: entry?.memberNumber ?? null,
          }
        : null,
    };
  }

  findPeopleByDocuments(
    scope: TenantScope,
    documents: readonly DocumentRef[],
  ): Promise<readonly ExistingPerson[]> {
    return Promise.resolve(
      this.world.people
        .filter(
          (person) =>
            person.denominationId === scope.denominationId &&
            documents.some(
              (ref) =>
                ref.documentTypeCode === person.documentTypeCode &&
                ref.documentNumber ===
                  normalizeDocumentNumber(person.documentNumber),
            ),
        )
        .map((person) => this.view(person)),
    );
  }

  findPerson(
    scope: TenantScope,
    personId: number,
  ): Promise<ExistingPerson | null> {
    const found = this.world.people.find(
      (person) =>
        person.id === personId &&
        person.denominationId === scope.denominationId,
    );
    return Promise.resolve(found ? this.view(found) : null);
  }

  createPerson(scope: TenantScope, data: PersonData): Promise<number> {
    this.guard('createPerson');
    const id = this.world.id();
    this.world.people.push({
      ...data,
      id,
      denominationId: scope.denominationId,
    });
    return Promise.resolve(id);
  }

  completePerson(
    scope: TenantScope,
    personId: number,
    data: PersonData,
  ): Promise<void> {
    this.guard('completePerson');
    const person = this.world.people.find(
      (row) =>
        row.id === personId && row.denominationId === scope.denominationId,
    );
    if (person) {
      for (const [key, value] of Object.entries(data)) {
        const current = person[key as keyof PersonData];
        if ((current === null || current === '') && value !== null) {
          (person as unknown as Record<string, unknown>)[key] = value;
        }
      }
    }
    return Promise.resolve();
  }

  createMember(scope: TenantScope, member: NewMember): Promise<number> {
    this.guard('createMember');
    const id = this.world.id();
    this.world.members.push({
      id,
      denominationId: scope.denominationId,
      personId: member.personId,
      congregationId: member.congregationId,
      status: 'ACTIVE',
      joinedOn: member.joinedOn,
      previousCongregationName: member.previousCongregationName,
      isBaptized: member.isBaptized,
    });
    return Promise.resolve(id);
  }

  reactivateMember(
    scope: TenantScope,
    reactivation: MemberReactivation,
  ): Promise<void> {
    this.guard('reactivateMember');
    const member = this.world.members.find(
      (row) =>
        row.id === reactivation.memberId &&
        row.denominationId === scope.denominationId,
    );
    if (member) {
      member.status = 'ACTIVE';
      member.congregationId = reactivation.congregationId;
    }
    return Promise.resolve();
  }

  openRegistryEntry(
    scope: TenantScope,
    entry: NewRegistryEntry,
  ): Promise<void> {
    this.guard('openRegistryEntry');
    for (const open of this.world.entries) {
      if (open.memberId === entry.memberId && open.endedOn === null) {
        open.endedOn = entry.startedOn;
      }
    }
    this.world.entries.push({
      ...entry,
      denominationId: scope.denominationId,
      endedOn: null,
    });
    return Promise.resolve();
  }

  recordStatus(scope: TenantScope, record: StatusRecord): Promise<void> {
    this.guard('recordStatus');
    this.world.histories.push({
      ...record,
      denominationId: scope.denominationId,
    });
    return Promise.resolve();
  }

  recordConsent(scope: TenantScope, consent: NewConsent): Promise<void> {
    this.guard('recordConsent');
    this.world.consents.push({
      ...consent,
      denominationId: scope.denominationId,
    });
    return Promise.resolve();
  }

  linkGuardian(
    scope: TenantScope,
    personId: number,
    guardianPersonId: number,
  ): Promise<void> {
    this.guard('linkGuardian');
    this.world.relations.push({
      denominationId: scope.denominationId,
      personId,
      relativeId: guardianPersonId,
    });
    return Promise.resolve();
  }
}

let nextApplicationId = 1;

/** A reviewable application of congregation 10 of denomination 1, adult unless overridden. */
export function buildApplication(
  overrides: Partial<ApplicationRecord> = {},
): ApplicationRecord {
  const id = overrides.id ?? nextApplicationId++;
  return {
    id,
    denominationId: 1,
    congregationId: 10,
    congregationName: 'Sede Central',
    congregationCode: 'SC',
    policyId: 5,
    policyVersion: '1.0',
    status: 'PENDING',
    documentTypeCode: 'CC',
    documentTypeName: 'Cédula de ciudadanía',
    documentNumber: `1000${id}`,
    firstName: 'Ana',
    lastName: 'Pérez',
    email: 'ana@example.com',
    phone: '3001234567',
    birthDate: '1990-05-20',
    guardianName: null,
    guardianDocument: null,
    formData: parseFormData({
      secondLastName: 'Gómez',
      sex: 'FEMALE',
      maritalStatusCode: 'SINGLE',
      address: 'Calle 1 # 2-3',
      municipalityCode: '13001',
      occupation: 'Docente',
      previousCongregationName: null,
      isBaptized: true,
    }),
    maritalStatusName: 'Soltero(a)',
    municipalityName: 'Cartagena',
    regionName: 'Bolívar',
    consentedAt: new Date('2026-10-30T15:00:00.000Z'),
    createdAt: new Date('2026-10-30T15:00:00.000Z'),
    reviewerId: null,
    reviewerName: null,
    reviewedAt: null,
    rejectionReason: null,
    matchedPersonId: null,
    memberId: null,
    memberNumber: null,
    ...overrides,
  };
}

export function buildPerson(
  overrides: Partial<PersonRow> & { id: number },
): PersonRow {
  return {
    denominationId: 1,
    documentTypeCode: 'CC',
    documentNumber: '1',
    firstName: 'Persona',
    lastName: 'Existente',
    secondLastName: null,
    sex: null,
    birthDate: null,
    maritalStatusCode: null,
    occupation: null,
    phone: null,
    email: null,
    address: null,
    municipalityCode: null,
    neighborhood: null,
    ...overrides,
  };
}
