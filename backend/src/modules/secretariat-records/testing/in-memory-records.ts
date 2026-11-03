import { type Page, buildPage } from '../../../common/pagination/page.js';
import type { TenantScope } from '../../../common/tenancy/tenant-scope.js';
import { ageOn } from '../../../common/people/age.js';
import { CONGREGATIONS } from '../../attendance/testing/in-memory-attendance.repository.js';
import type {
  ChildDedicationRepository,
  CongregationDirectory,
  MarriageRepository,
  NewChildDedication,
  NewMarriage,
  PastoralTermRepository,
  PeopleDirectory,
  PeopleSearch,
} from '../application/ports/records.ports.js';
import {
  type ChildDedicationRecord,
  type DedicationFilter,
  type MarriageEndReason,
  type MarriageFilter,
  type MarriageRecord,
  type NamedOption,
  type PastoralTermFilter,
  type PastoralTermRecord,
  type PersonEligibility,
  type PersonOption,
  type PersonSummary,
  type TermPeriod,
  marriageCode,
} from '../application/records.models.js';

export const TODAY = '2026-11-02';

/** The fake world: one set of people per denomination, tagged with the tenant that owns them. */
export class FakeRecordsWorld {
  readonly people: (PersonSummary & { denominationId: number })[] = [];
  readonly dedications: (ChildDedicationRecord & { childId: number })[] = [];
  readonly marriages: (MarriageRecord & {
    spouse1Id: number;
    spouse2Id: number;
  })[] = [];
  readonly terms: (PastoralTermRecord & { pastorId: number })[] = [];
  readonly locks: string[] = [];
  private nextId = 100;

  /** Adds a person. A member has a `congregationId`; an adult by default (born in 1985). */
  person(
    denominationId: number,
    fullName: string,
    options: {
      congregationId?: number | null;
      birthDate?: string | null;
      sex?: 'FEMALE' | 'MALE' | null;
    } = {},
  ): PersonSummary {
    const birthDate =
      options.birthDate === undefined ? '1985-04-12' : options.birthDate;
    const summary: PersonSummary & { denominationId: number } = {
      id: this.nextId++,
      denominationId,
      fullName,
      memberCode: options.congregationId == null ? null : `SC-${this.nextId}`,
      congregationId: options.congregationId ?? null,
      sex: options.sex ?? null,
      birthDate,
      age: birthDate ? ageOn(birthDate, TODAY) : null,
      maskedDocument: 'CC ···· 4817',
    };
    this.people.push(summary);
    return summary;
  }

  id(): number {
    return this.nextId++;
  }

  summaryOf(id: number): PersonSummary {
    const found = this.people.find((person) => person.id === id);
    if (!found) {
      throw new Error(`Unknown person ${id}`);
    }
    return {
      id: found.id,
      fullName: found.fullName,
      memberCode: found.memberCode,
      congregationId: found.congregationId,
      sex: found.sex,
      birthDate: found.birthDate,
      age: found.age,
      maskedDocument: found.maskedDocument,
    };
  }
}

function inTenant(
  scope: TenantScope,
  row: { denominationId: number; congregationId?: number },
): boolean {
  return (
    row.denominationId === scope.denominationId &&
    (scope.congregationId === null ||
      row.congregationId === undefined ||
      row.congregationId === scope.congregationId)
  );
}

function matchesText(names: readonly string[], q: string | undefined): boolean {
  if (!q) {
    return true;
  }
  const haystack = names.join(' ').toLowerCase();
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((token) => haystack.includes(token));
}

export class FakeCongregationDirectory implements CongregationDirectory {
  listActive(scope: TenantScope): Promise<NamedOption[]> {
    return Promise.resolve(
      CONGREGATIONS.filter(
        (c) =>
          c.denominationId === scope.denominationId &&
          (scope.congregationId === null || c.id === scope.congregationId),
      ).map(({ id, name }) => ({ id, name })),
    );
  }

  async findActive(
    scope: TenantScope,
    id: number,
  ): Promise<NamedOption | null> {
    return (await this.listActive(scope)).find((c) => c.id === id) ?? null;
  }
}

export class FakePeopleDirectory implements PeopleDirectory {
  constructor(private readonly world: FakeRecordsWorld) {}

  findByIds(
    scope: TenantScope,
    ids: readonly number[],
  ): Promise<PersonSummary[]> {
    return Promise.resolve(
      this.world.people
        .filter(
          (person) =>
            person.denominationId === scope.denominationId &&
            ids.includes(person.id),
        )
        .map((person) => this.world.summaryOf(person.id)),
    );
  }

  createNameOnly(scope: TenantScope, fullName: string): Promise<number> {
    return Promise.resolve(
      this.world.person(scope.denominationId, fullName, { birthDate: null }).id,
    );
  }

  lock(_scope: TenantScope, ids: readonly number[]): Promise<void> {
    this.world.locks.push(`people:${[...ids].join(',')}`);
    return Promise.resolve();
  }
}

export class FakePeopleSearch implements PeopleSearch {
  constructor(private readonly world: FakeRecordsWorld) {}

  search(
    scope: TenantScope,
    params: { query: string; limit?: number; eligibleFor?: PersonEligibility },
  ): Promise<PersonOption[]> {
    return Promise.resolve(
      this.world.people
        .filter(
          (person) =>
            person.denominationId === scope.denominationId &&
            matchesText([person.fullName], params.query),
        )
        .slice(0, params.limit ?? 8)
        .map((person) => ({
          ...this.world.summaryOf(person.id),
          hasActiveMarriage: this.world.marriages.some(
            (m) =>
              m.endedOn === null &&
              (m.spouse1Id === person.id || m.spouse2Id === person.id),
          ),
        })),
    );
  }
}

export class InMemoryChildDedicationRepository implements ChildDedicationRepository {
  constructor(private readonly world: FakeRecordsWorld) {}

  list(
    scope: TenantScope,
    filter: DedicationFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<ChildDedicationRecord>> {
    const rows = this.world.dedications
      .filter(
        (row) =>
          inTenant(scope, row) &&
          matchesText([row.child.fullName], filter.q) &&
          (filter.from === undefined || row.dedicatedOn >= filter.from) &&
          (filter.to === undefined || row.dedicatedOn <= filter.to),
      )
      .sort(
        (a, b) => b.dedicatedOn.localeCompare(a.dedicatedOn) || b.id - a.id,
      );
    const start = (page.page - 1) * page.pageSize;
    return Promise.resolve(
      buildPage(rows.slice(start, start + page.pageSize), rows.length, page),
    );
  }

  find(scope: TenantScope, id: number): Promise<ChildDedicationRecord | null> {
    return Promise.resolve(
      this.world.dedications.find(
        (row) => row.id === id && inTenant(scope, row),
      ) ?? null,
    );
  }

  existsForChild(scope: TenantScope, childId: number): Promise<boolean> {
    return Promise.resolve(
      this.world.dedications.some(
        (row) =>
          row.denominationId === scope.denominationId &&
          row.childId === childId,
      ),
    );
  }

  create(
    scope: TenantScope,
    data: NewChildDedication,
  ): Promise<ChildDedicationRecord> {
    const parent = (role: 'FATHER' | 'MOTHER' | 'GUARDIAN') => {
      const found = data.parents.find((item) => item.role === role);
      if (!found) {
        return null;
      }
      const person = this.world.summaryOf(found.personId);
      return {
        personId: person.id,
        name: person.fullName,
        memberCode: person.memberCode,
      };
    };
    const congregation = CONGREGATIONS.find(
      (c) => c.id === data.congregationId,
    );
    const row = {
      id: this.world.id(),
      denominationId: scope.denominationId,
      congregationId: data.congregationId,
      congregationName: congregation?.name ?? '',
      dedicatedOn: data.dedicatedOn,
      childId: data.childId,
      child: this.world.summaryOf(data.childId),
      pastor:
        data.pastorId === null ? null : this.world.summaryOf(data.pastorId),
      father: parent('FATHER'),
      mother: parent('MOTHER'),
      guardian: parent('GUARDIAN'),
    };
    this.world.dedications.push(row);
    return Promise.resolve(row);
  }

  counts(
    scope: TenantScope,
    year: number,
  ): Promise<{ total: number; thisYear: number }> {
    const rows = this.world.dedications.filter((row) => inTenant(scope, row));
    return Promise.resolve({
      total: rows.length,
      thisYear: rows.filter((row) => row.dedicatedOn.startsWith(String(year)))
        .length,
    });
  }
}

export class InMemoryMarriageRepository implements MarriageRepository {
  constructor(private readonly world: FakeRecordsWorld) {}

  private visible(scope: TenantScope) {
    return this.world.marriages.filter(
      (row) =>
        row.denominationId === scope.denominationId &&
        (scope.congregationId === null ||
          row.spouse1.congregationId === scope.congregationId ||
          row.spouse2.congregationId === scope.congregationId),
    );
  }

  list(
    scope: TenantScope,
    filter: MarriageFilter,
    page: { page: number; pageSize: number },
  ): Promise<Page<MarriageRecord>> {
    const rows = this.visible(scope)
      .filter(
        (row) =>
          (filter.status === undefined ||
            (filter.status === 'active') === (row.status === 'ACTIVE')) &&
          matchesText([row.spouse1.fullName, row.spouse2.fullName], filter.q),
      )
      .sort(
        (a, b) =>
          (b.marriedOn ?? '').localeCompare(a.marriedOn ?? '') || b.id - a.id,
      );
    const start = (page.page - 1) * page.pageSize;
    return Promise.resolve(
      buildPage(rows.slice(start, start + page.pageSize), rows.length, page),
    );
  }

  find(scope: TenantScope, id: number): Promise<MarriageRecord | null> {
    return Promise.resolve(
      this.visible(scope).find((row) => row.id === id) ?? null,
    );
  }

  hasActiveMarriage(
    scope: TenantScope,
    personIds: readonly number[],
  ): Promise<boolean> {
    return Promise.resolve(
      this.world.marriages.some(
        (row) =>
          row.denominationId === scope.denominationId &&
          row.endedOn === null &&
          (personIds.includes(row.spouse1Id) ||
            personIds.includes(row.spouse2Id)),
      ),
    );
  }

  create(scope: TenantScope, data: NewMarriage): Promise<MarriageRecord> {
    const id = this.world.id();
    const row = {
      id,
      code: marriageCode(id),
      denominationId: scope.denominationId,
      spouse1Id: data.spouse1Id,
      spouse2Id: data.spouse2Id,
      spouse1: this.world.summaryOf(data.spouse1Id),
      spouse2: this.world.summaryOf(data.spouse2Id),
      registeredWith: data.registeredWith,
      marriedOn: data.marriedOn,
      place: data.place,
      officiant:
        data.officiantId === null
          ? null
          : this.world.summaryOf(data.officiantId),
      endedOn: null,
      endReason: null,
      status: 'ACTIVE' as const,
    };
    this.world.marriages.push(row);
    return Promise.resolve(row);
  }

  dissolve(
    scope: TenantScope,
    id: number,
    data: { endedOn: string; endReason: MarriageEndReason },
  ): Promise<MarriageRecord> {
    const index = this.world.marriages.findIndex(
      (row) => row.id === id && row.denominationId === scope.denominationId,
    );
    const updated = {
      ...this.world.marriages[index],
      endedOn: data.endedOn,
      endReason: data.endReason,
      status: 'DISSOLVED' as const,
    };
    this.world.marriages[index] = updated;
    return Promise.resolve(updated);
  }

  counts(scope: TenantScope): Promise<{ active: number; dissolved: number }> {
    const rows = this.visible(scope);
    return Promise.resolve({
      active: rows.filter((row) => row.status === 'ACTIVE').length,
      dissolved: rows.filter((row) => row.status === 'DISSOLVED').length,
    });
  }
}

export class InMemoryPastoralTermRepository implements PastoralTermRepository {
  constructor(private readonly world: FakeRecordsWorld) {}

  list(
    scope: TenantScope,
    filter: PastoralTermFilter,
  ): Promise<PastoralTermRecord[]> {
    return Promise.resolve(
      this.world.terms
        .filter(
          (row) =>
            inTenant(scope, row) &&
            (!filter.currentOnly || row.endedOn === null),
        )
        .sort(
          (a, b) =>
            a.congregationId - b.congregationId ||
            b.startedOn.localeCompare(a.startedOn),
        ),
    );
  }

  find(scope: TenantScope, id: number): Promise<PastoralTermRecord | null> {
    return Promise.resolve(
      this.world.terms.find((row) => row.id === id && inTenant(scope, row)) ??
        null,
    );
  }

  lockCongregation(_scope: TenantScope, congregationId: number): Promise<void> {
    this.world.locks.push(`congregation:${congregationId}`);
    return Promise.resolve();
  }

  periodsOf(scope: TenantScope, congregationId: number): Promise<TermPeriod[]> {
    return Promise.resolve(
      this.world.terms
        .filter(
          (row) =>
            row.denominationId === scope.denominationId &&
            row.congregationId === congregationId,
        )
        .map(({ id, startedOn, endedOn }) => ({ id, startedOn, endedOn })),
    );
  }

  create(
    scope: TenantScope,
    data: {
      congregationId: number;
      pastorId: number;
      startedOn: string;
      endedOn: string | null;
    },
  ): Promise<PastoralTermRecord> {
    const row = {
      id: this.world.id(),
      denominationId: scope.denominationId,
      congregationId: data.congregationId,
      congregationName:
        CONGREGATIONS.find((c) => c.id === data.congregationId)?.name ?? '',
      pastorId: data.pastorId,
      pastor: this.world.summaryOf(data.pastorId),
      startedOn: data.startedOn,
      endedOn: data.endedOn,
    };
    this.world.terms.push(row);
    return Promise.resolve(row);
  }

  setEndDate(scope: TenantScope, id: number, endedOn: string): Promise<void> {
    const index = this.world.terms.findIndex(
      (row) => row.id === id && inTenant(scope, row),
    );
    this.world.terms[index] = { ...this.world.terms[index], endedOn };
    return Promise.resolve();
  }

  /** Test helper: a term of any tenant. */
  seed(
    denominationId: number,
    congregationId: number,
    pastor: PersonSummary,
    startedOn: string,
    endedOn: string | null,
  ): PastoralTermRecord {
    const row = {
      id: this.world.id(),
      denominationId,
      congregationId,
      congregationName:
        CONGREGATIONS.find((c) => c.id === congregationId)?.name ?? '',
      pastorId: pastor.id,
      pastor,
      startedOn,
      endedOn,
    };
    this.world.terms.push(row);
    return row;
  }
}
