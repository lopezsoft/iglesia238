import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DomainError } from '../../../../core/errors/domain-error';
import { MarriageInput, PastoralTermInput } from './records.models';
import { RecordsRepository } from './records.repository';
import { DemoRecordsRepository } from './demo-records.repository';

const SECRETARY_CENTRAL = 'marta.castillo@montedesion.example';
const SECRETARY_NORTE = 'paola.ruiz@montedesion.example';
const PASTOR_CENTRAL = 'daniel.herrera@montedesion.example';
const TREASURER_CENTRAL = 'jorge.ramirez@montedesion.example';
const ADMIN_DENOMINATION_2 = 'ricardo.leon@vidanueva.example';

async function signIn(email: string): Promise<RecordsRepository> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: RecordsRepository, useClass: DemoRecordsRepository },
    ],
  });
  await firstValueFrom(TestBed.inject(AuthService).login(email, DEMO_PASSWORD));
  return TestBed.inject(RecordsRepository);
}

async function failure(promise: Promise<unknown>): Promise<DomainError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

function marriage(overrides: Partial<MarriageInput> = {}): MarriageInput {
  // Persons 6 and 9 are single members of Sede Central in the fixtures.
  return {
    spouse1Id: 9,
    spouse2Id: 6,
    marriedOn: '2026-10-10',
    place: 'Sede Central · Templo principal',
    registeredWith: 'CHURCH',
    officiantId: 1,
    ...overrides,
  };
}

/** Isabella (born 2023-01-25): a child of a Sede Central family without membership. */
function minorWithoutMembership(): number {
  const db = TestBed.inject(DemoDatabase);
  const person = db.persons.find((item) => item.birthDate === '2023-01-25');
  if (!person || db.members.some((member) => member.personId === person.id)) {
    throw new Error('Minor without membership not seeded');
  }
  return person.id;
}

function term(overrides: Partial<PastoralTermInput> = {}): PastoralTermInput {
  return { congregationId: 1, pastorId: 15, startedOn: '2026-11-01', endedOn: null, closeCurrent: false, ...overrides };
}

describe('DemoRecordsRepository · marriages', () => {
  it('records a marriage with the lower person id as spouse 1', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const created = await firstValueFrom(repository.createMarriage(marriage()));

    expect(created.spouse1.id).toBe(6);
    expect(created.spouse2.id).toBe(9);
    expect(created.endedOn).toBeNull();
  });

  it('rejects a person with an active marriage until it is dissolved', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);
    // Person 4 is married to person 21 (marriage 4, active).
    const withMarried = marriage({ spouse1Id: 4, spouse2Id: 9 });

    const error = await failure(firstValueFrom(repository.createMarriage(withMarried)));
    expect(error.code).toBe('ACTIVE_MARRIAGE_EXISTS');

    await firstValueFrom(repository.dissolveMarriage(4, { endedOn: '2025-01-15', endReason: 'DIVORCE' }));
    const created = await firstValueFrom(repository.createMarriage(withMarried));
    expect([created.spouse1.id, created.spouse2.id]).toEqual([4, 9]);
  });

  it('requires two different people', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const error = await failure(firstValueFrom(repository.createMarriage(marriage({ spouse2Id: 9 }))));
    expect(error.code).toBe('SAME_PERSON');
  });

  it('accepts a dissolution on or after the marriage date, once, and audits it without personal data', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);
    // Marriage 7 was celebrated on 2026-07-18.
    const early = await failure(
      firstValueFrom(repository.dissolveMarriage(7, { endedOn: '2026-07-17', endReason: 'ANNULMENT' })),
    );
    expect(early.code).toBe('INVALID_DATE');

    const dissolved = await firstValueFrom(
      repository.dissolveMarriage(7, { endedOn: '2026-07-18', endReason: 'ANNULMENT' }),
    );
    expect(dissolved.endReason).toBe('ANNULMENT');
    expect(TestBed.inject(DemoDatabase).auditLogs.at(-1)?.changes).toEqual({
      status: { from: 'ACTIVE', to: 'DISSOLVED' },
      endReason: { from: null, to: 'ANNULMENT' },
    });

    const again = await failure(
      firstValueFrom(repository.dissolveMarriage(7, { endedOn: '2026-08-01', endReason: 'DIVORCE' })),
    );
    expect(again.code).toBe('ALREADY_DISSOLVED');
  });

  it('rejects a spouse who is a minor or born after the marriage date', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);
    const minor = minorWithoutMembership();

    const today = await failure(firstValueFrom(repository.createMarriage(marriage({ spouse2Id: minor }))));
    expect(today.code).toBe('INVALID_SPOUSE');
    const beforeBirth = await failure(
      firstValueFrom(repository.createMarriage(marriage({ spouse2Id: minor, marriedOn: '2020-01-01' }))),
    );
    expect(beforeBirth.code).toBe('INVALID_SPOUSE');
  });

  it('shows a sede only the marriages of its members', async () => {
    const repository = await signIn(SECRETARY_NORTE);

    const marriages = await firstValueFrom(repository.marriages());

    expect(marriages.map((row) => row.id)).toEqual([5]);
    const error = await failure(
      firstValueFrom(repository.dissolveMarriage(4, { endedOn: '2025-01-15', endReason: 'DIVORCE' })),
    );
    expect(error.code).toBe('NOT_FOUND');
  });
});

describe('DemoRecordsRepository · pastoral terms', () => {
  it('rejects a term that overlaps the open term of the sede', async () => {
    const repository = await signIn(PASTOR_CENTRAL);

    const error = await failure(firstValueFrom(repository.createPastoralTerm(term())));
    expect(error.code).toBe('OVERLAPPING_TERM');
  });

  it('rejects a term that overlaps a closed one', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const error = await failure(
      firstValueFrom(repository.createPastoralTerm(term({ startedOn: '2010-01-01', endedOn: '2012-01-01' }))),
    );
    expect(error.code).toBe('OVERLAPPING_TERM');
  });

  it('closes the current term the day before the new one when asked', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const created = await firstValueFrom(repository.createPastoralTerm(term({ closeCurrent: true })));

    const terms = await firstValueFrom(repository.pastoralTerms());
    expect(created.endedOn).toBeNull();
    expect(terms.find((row) => row.id === 4)?.endedOn).toBe('2026-10-31');
    expect(terms.filter((row) => row.endedOn === null).map((row) => row.id)).toEqual([created.id]);
  });

  it('accepts a closed term in a free range and rejects an end before the start', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const before = await firstValueFrom(
      repository.createPastoralTerm(term({ startedOn: '1990-01-01', endedOn: '1994-01-14' })),
    );
    expect(before.endedOn).toBe('1994-01-14');

    const error = await failure(
      firstValueFrom(repository.createPastoralTerm(term({ startedOn: '1985-05-01', endedOn: '1985-04-30' }))),
    );
    expect(error.code).toBe('INVALID_DATE');
  });

  it('does not compare terms of different sedes', async () => {
    const repository = await signIn(SECRETARY_NORTE);

    const terms = await firstValueFrom(repository.pastoralTerms());
    expect(new Set(terms.map((row) => row.congregationId))).toEqual(new Set([2]));
    // 2005–2007 overlaps Sede Central terms but is free in Sede Norte.
    const created = await firstValueFrom(
      repository.createPastoralTerm(term({ congregationId: 2, startedOn: '2005-01-01', endedOn: '2007-12-31' })),
    );
    expect(created.congregationId).toBe(2);
    const outside = await failure(firstValueFrom(repository.createPastoralTerm(term({ congregationId: 1 }))));
    expect(outside.code).toBe('FORBIDDEN');
  });
});

describe('DemoRecordsRepository · child dedications', () => {
  it('records a dedication with a registered parent and a parent by name', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const created = await firstValueFrom(
      repository.createDedication({
        congregationId: 1,
        childId: 18,
        dedicatedOn: '2004-01-11',
        pastorId: 23,
        father: { personId: 15, name: null },
        mother: { personId: null, name: '  Gloria Muñoz ' },
      }),
    );

    expect(created.father).toEqual(expect.objectContaining({ personId: 15, memberCode: expect.stringMatching(/^SC-\d{4}$/) }));
    expect(created.mother).toEqual({ personId: null, name: 'Gloria Muñoz', memberCode: null });
    expect(created.child.maskedDocument).toMatch(/^CC ···· \d{4}$/);
  });

  it('rejects a dedication before the birth date or without parents', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);
    const base = { congregationId: 1, childId: 18, pastorId: null, father: null, mother: null };

    const beforeBirth = await failure(
      firstValueFrom(
        repository.createDedication({ ...base, dedicatedOn: '2003-01-01', mother: { personId: 20, name: null } }),
      ),
    );
    expect(beforeBirth.code).toBe('INVALID_DATE');
    const noParents = await failure(firstValueFrom(repository.createDedication({ ...base, dedicatedOn: '2003-06-01' })));
    expect(noParents.code).toBe('PARENT_REQUIRED');
  });

  it('lists only the dedications of the active sede', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const dedications = await firstValueFrom(repository.dedications());

    expect(dedications.length).toBeGreaterThan(0);
    expect(dedications.every((row) => row.congregationId === 1)).toBe(true);
    expect(dedications[0].dedicatedOn >= dedications.at(-1)!.dedicatedOn).toBe(true);
  });
});

describe('DemoRecordsRepository · tenant isolation and permissions', () => {
  it('never returns or accepts records of another denomination', async () => {
    const repository = await signIn(ADMIN_DENOMINATION_2);

    const [dedications, marriages, terms, context] = await Promise.all([
      firstValueFrom(repository.dedications()),
      firstValueFrom(repository.marriages()),
      firstValueFrom(repository.pastoralTerms()),
      firstValueFrom(repository.context()),
    ]);
    expect([...dedications, ...marriages, ...terms].every((row) => row.denominationId === 2)).toBe(true);
    expect(context.people.every((person) => person.id >= 48)).toBe(true);
    expect(context.congregations.map((sede) => sede.id)).toEqual([4, 5]);
  });

  it('does not hand a sede the people of other sedes', async () => {
    const repository = await signIn(SECRETARY_NORTE);

    const context = await firstValueFrom(repository.context());

    const ids = context.people.map((person) => person.id);
    // Persons 6 and 9 are members of Sede Central with no record in Sede Norte.
    expect(ids).not.toContain(6);
    expect(ids).not.toContain(9);
    expect(context.people.every((person) => person.congregationId === null || person.congregationId === 2)).toBe(
      true,
    );
  });

  it('rejects a dedication of a child or parent who is a member of another sede', async () => {
    const repository = await signIn(SECRETARY_NORTE);
    const base = { congregationId: 2, dedicatedOn: '2026-10-04', pastorId: null, father: null };

    const child = await failure(
      firstValueFrom(
        repository.createDedication({ ...base, childId: 9, mother: { personId: null, name: 'Madre de prueba' } }),
      ),
    );
    expect(child.code).toBe('OUT_OF_SCOPE');
    const parent = await failure(
      firstValueFrom(
        repository.createDedication({
          ...base,
          childId: minorWithoutMembership(),
          mother: { personId: 6, name: null },
        }),
      ),
    );
    expect(parent.code).toBe('OUT_OF_SCOPE');
  });

  it('rejects people of another denomination', async () => {
    const repository = await signIn(SECRETARY_CENTRAL);

    const error = await failure(firstValueFrom(repository.createMarriage(marriage({ spouse2Id: 50 }))));
    expect(error.code).toBe('PERSON_NOT_FOUND');
  });

  it('rejects writes from a role without members.write', async () => {
    const repository = await signIn(TREASURER_CENTRAL);

    expect((await failure(firstValueFrom(repository.createMarriage(marriage())))).code).toBe('FORBIDDEN');
    expect((await failure(firstValueFrom(repository.createPastoralTerm(term({ closeCurrent: true }))))).code).toBe(
      'FORBIDDEN',
    );
  });
});
