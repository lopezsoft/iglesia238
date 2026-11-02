import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { DemoMembersRepository } from './demo-members.repository';
import { MemberFilters, MemberListQuery, PersonUpdate, todayIso } from './members.models';
import { MembershipDemoStore } from './membership-demo-store';

const SECRETARY = 'marta.castillo@montedesion.example'; // Secretary of Sede Central
const PASTOR = 'daniel.herrera@montedesion.example'; // Pastor of Sede Central
const DENOMINATION_ADMIN = 'andres.molina@montedesion.example'; // Admin of denomination 1
const OTHER_DENOMINATION_ADMIN = 'ricardo.leon@vidanueva.example'; // Admin of denomination 2
const TREASURER = 'jorge.ramirez@montedesion.example';

const ALL: MemberFilters = {
  text: '',
  status: 'ALL',
  sex: 'ALL',
  ageRange: 'ALL',
  position: 'ALL',
};
const FIRST_PAGE: MemberListQuery = { ...ALL, page: 1, pageSize: 100 };

async function setup(email: string) {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [{ provide: AuthGateway, useClass: DemoAuthGateway }, DemoMembersRepository],
  });
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  return {
    auth,
    repository: TestBed.inject(DemoMembersRepository),
    db: TestBed.inject(DemoDatabase),
    store: TestBed.inject(MembershipDemoStore),
  };
}

async function failure(command: Observable<unknown>): Promise<DomainError> {
  const error = await firstValueFrom(command).then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

function personUpdate(
  db: DemoDatabase,
  personId: number,
  changes: Partial<PersonUpdate>,
): PersonUpdate {
  const person = db.person(personId)!;
  return {
    firstName: person.firstName,
    lastName: person.lastName,
    secondLastName: person.secondLastName,
    documentTypeCode: person.documentTypeCode,
    documentNumber: person.documentNumber,
    birthDate: person.birthDate,
    sex: person.sex,
    maritalStatusCode: person.maritalStatusCode,
    educationLevelCode: person.educationLevelCode,
    occupation: person.occupation,
    phone: person.phone,
    email: person.email,
    address: person.address,
    municipalityCode: person.municipalityCode,
    ...changes,
  };
}

describe('DemoMembersRepository', () => {
  describe('tenant isolation', () => {
    it('lists only the members of the sede of a congregation-scoped secretary', async () => {
      const { repository, db } = await setup(SECRETARY);
      const page = await firstValueFrom(repository.list(FIRST_PAGE));

      const expected = db.members.filter((member) => member.congregationId === 1).length;
      expect(page.total).toBe(expected);
      expect(page.items.every((row) => row.congregationId === 1)).toBe(true);
      expect(page.statusCounts.ALL).toBe(expected);
    });

    it('lists every sede of the denomination, and only it, for the denomination admin', async () => {
      const { repository, db } = await setup(DENOMINATION_ADMIN);
      const page = await firstValueFrom(repository.list(FIRST_PAGE));

      expect(page.total).toBe(db.members.filter((member) => member.denominationId === 1).length);
      expect(new Set(page.items.map((row) => row.congregationId))).toEqual(new Set([1, 2, 3]));
    });

    it('answers NOT_FOUND for a member of another sede or denomination', async () => {
      const secretary = await setup(SECRETARY);
      expect((await failure(secretary.repository.detail(28))).code).toBe('NOT_FOUND');

      TestBed.resetTestingModule();
      const otherAdmin = await setup(OTHER_DENOMINATION_ADMIN);
      expect((await failure(otherAdmin.repository.detail(4))).code).toBe('NOT_FOUND');
      expect((await failure(otherAdmin.repository.studies(4))).code).toBe('NOT_FOUND');
    });

    it('rejects a role without members.read', async () => {
      const { repository } = await setup(TREASURER);
      expect((await failure(repository.list(FIRST_PAGE))).code).toBe('FORBIDDEN');
    });

    it('never offers persons of another denomination as relatives', async () => {
      const { repository } = await setup(SECRETARY);
      const options = await firstValueFrom(repository.searchRelatives(4, 'Ruiz'));

      expect(options.length).toBeGreaterThan(0);
      expect(options.length).toBeLessThanOrEqual(8);
      // Persons 48 and above belong to denomination 2.
      expect(options.every((option) => option.id <= 47 && option.id !== 4)).toBe(true);
      expect(
        (await failure(repository.addFamilyRelation(4, { relativeId: 49, type: 'CHILD' }))).code,
      ).toBe('NOT_FOUND');
    });
  });

  describe('list filters', () => {
    it('filters by document, status and age range and counts per status', async () => {
      const { repository, db } = await setup(SECRETARY);
      const document = db.person(4)!.documentNumber!;

      const byDocument = await firstValueFrom(repository.list({ ...FIRST_PAGE, text: document }));
      expect(byDocument.items.map((row) => row.id)).toEqual([4]);

      const inactive = await firstValueFrom(repository.list({ ...FIRST_PAGE, status: 'INACTIVE' }));
      expect(inactive.items.every((row) => row.status === 'INACTIVE')).toBe(true);
      expect(inactive.total).toBe(inactive.statusCounts.INACTIVE);

      const seniors = await firstValueFrom(repository.list({ ...FIRST_PAGE, ageRange: 'SENIORS' }));
      expect(seniors.items.every((row) => (row.age ?? 0) >= 60)).toBe(true);
    });

    it('filters by open position and paginates by 10', async () => {
      const { repository } = await setup(SECRETARY);
      const teachers = await firstValueFrom(repository.list({ ...FIRST_PAGE, position: 6 }));
      expect(teachers.items.map((row) => row.id)).toEqual([4]);

      const page = await firstValueFrom(repository.list({ ...ALL, page: 2, pageSize: 10 }));
      expect(page.items.length).toBe(10);
      expect(page.page).toBe(2);
    });
  });

  describe('permissions', () => {
    it('lets the secretary read and edit the socioeconomic profile and audits without data', async () => {
      const { repository, db } = await setup(SECRETARY);
      const profile = await firstValueFrom(repository.socioeconomicProfile(4));
      expect(profile?.hasHealthCoverage).toBe(true);

      const saved = await firstValueFrom(
        repository.saveSocioeconomicProfile(4, {
          hasHealthCoverage: true,
          hasPension: false,
          hasOccupationalRiskCoverage: null,
          isSubsidizedRegime: true,
          hasFamilyCompensation: null,
          sisbenLevel: 2,
          isDisplaced: false,
        }),
      );
      expect(saved.sisbenLevel).toBe(2);
      const audit = db.auditLogs.at(-1)!;
      expect(audit.entity).toBe('SocioeconomicProfile');
      expect(audit.changes).toBeNull();
    });

    it('lets the pastor read but not edit the socioeconomic profile', async () => {
      const { repository } = await setup(PASTOR);
      expect(await firstValueFrom(repository.socioeconomicProfile(4))).not.toBeNull();

      const error = await failure(
        repository.saveSocioeconomicProfile(4, {
          hasHealthCoverage: null,
          hasPension: null,
          hasOccupationalRiskCoverage: null,
          isSubsidizedRegime: null,
          hasFamilyCompensation: null,
          sisbenLevel: null,
          isDisplaced: null,
        }),
      );
      expect(error.code).toBe('FORBIDDEN');
    });

    it('keeps the denomination admin read-only: no socioeconomic data, edits, export or revocation', async () => {
      const { repository, db } = await setup(DENOMINATION_ADMIN);

      expect((await failure(repository.socioeconomicProfile(4))).code).toBe('FORBIDDEN');
      expect(
        (await failure(repository.updatePerson(4, personUpdate(db, 4, { phone: '300 555 9999' }))))
          .code,
      ).toBe('FORBIDDEN');
      expect((await failure(repository.exportRows(ALL))).code).toBe('FORBIDDEN');
      expect((await failure(repository.revokeConsent(4, 4))).code).toBe('FORBIDDEN');
      expect(
        (
          await failure(
            repository.transfer(4, {
              kind: 'INTERNAL',
              destinationCongregationId: 2,
              transferDate: todayIso(),
              reason: 'Otro',
            }),
          )
        ).code,
      ).toBe('FORBIDDEN');
    });

    it('exports every filtered row (not just one page) and audits the count only', async () => {
      const { repository, db } = await setup(SECRETARY);
      const rows = await firstValueFrom(repository.exportRows({ ...ALL, status: 'ACTIVE' }));

      expect(rows.length).toBe(
        db.members.filter((m) => m.congregationId === 1 && m.status === 'ACTIVE').length,
      );
      const audit = db.auditLogs.at(-1)!;
      expect(audit.action).toBe('MEMBERS_EXPORTED');
      expect(audit.changes).toEqual({ rows: { from: null, to: rows.length } });
    });
  });

  describe('personal data', () => {
    it('rejects a document that another person of the denomination already has', async () => {
      const { repository, db } = await setup(SECRETARY);
      const other = db.person(6)!;

      const error = await failure(
        repository.updatePerson(
          4,
          personUpdate(db, 4, {
            documentTypeCode: other.documentTypeCode,
            documentNumber: other.documentNumber,
          }),
        ),
      );
      expect(error.code).toBe('DUPLICATE_DOCUMENT');
      expect(error.message).not.toContain(other.documentNumber!);
    });

    it('allows a document that only exists in another denomination', async () => {
      const { repository, db } = await setup(SECRETARY);
      const foreign = db.person(48)!;
      expect(foreign.denominationId).toBe(2);

      const detail = await firstValueFrom(
        repository.updatePerson(
          4,
          personUpdate(db, 4, {
            documentTypeCode: foreign.documentTypeCode,
            documentNumber: foreign.documentNumber,
          }),
        ),
      );
      expect(detail.person.documentNumber).toBe(foreign.documentNumber);
    });

    it('validates the document pair and keeps personal data out of the audit', async () => {
      const { repository, db } = await setup(SECRETARY);
      const error = await failure(
        repository.updatePerson(4, personUpdate(db, 4, { documentNumber: null })),
      );
      expect(error.code).toBe('VALIDATION');

      await firstValueFrom(
        repository.updatePerson(4, personUpdate(db, 4, { phone: '300 555 7777' })),
      );
      const audit = db.auditLogs.at(-1)!;
      expect(audit.entity).toBe('Person');
      expect(JSON.stringify(audit.changes)).not.toContain('300 555 7777');
    });
  });

  describe('transfers', () => {
    it('moves a member to another sede with the next number there and closes the current entry', async () => {
      const { repository, db, store } = await setup(SECRETARY);
      const date = todayIso();
      const previous = db.currentRegistryEntry(4)!;
      const expectedNumber =
        Math.max(
          ...db.memberRegistryEntries
            .filter((e) => e.congregationId === 2)
            .map((e) => e.memberNumber),
        ) + 1;

      const result = await firstValueFrom(
        repository.transfer(4, {
          kind: 'INTERNAL',
          destinationCongregationId: 2,
          transferDate: date,
          reason: 'Cambio de residencia',
        }),
      );

      expect(result).toEqual({
        kind: 'INTERNAL',
        destinationName: 'Sede Norte',
        stillVisible: false,
      });
      expect(db.memberRegistryEntries.find((e) => e.id === previous.id)?.endedOn).toBe(date);
      const current = db.currentRegistryEntry(4)!;
      expect(current.congregationId).toBe(2);
      expect(current.memberNumber).toBe(expectedNumber);
      expect(db.members.find((m) => m.id === 4)?.congregationId).toBe(2);
      expect(store.memberTransfers.at(-1)).toMatchObject({
        memberId: 4,
        originCongregationId: 1,
        destinationCongregationId: 2,
        status: 'COMPLETED',
      });

      const list = await firstValueFrom(repository.list(FIRST_PAGE));
      expect(list.items.some((row) => row.id === 4)).toBe(false);
      expect((await failure(repository.detail(4))).code).toBe('NOT_FOUND');
    });

    it('marks an external transfer as TRANSFERRED and closes the registry entry', async () => {
      const { repository, db } = await setup(SECRETARY);
      const date = todayIso();
      const result = await firstValueFrom(
        repository.transfer(7, {
          kind: 'EXTERNAL',
          externalDestinationName: 'Iglesia Bautista El Redil',
          transferDate: date,
          reason: 'Otro',
        }),
      );

      expect(result.stillVisible).toBe(true);
      expect(db.members.find((m) => m.id === 7)?.status).toBe('TRANSFERRED');
      expect(db.currentRegistryEntry(7)).toBeUndefined();
      expect(db.memberRegistryEntries.find((e) => e.memberId === 7)?.endedOn).toBe(date);
    });

    it('closes every open position of a member transferred to another church', async () => {
      const { repository, db, store } = await setup(SECRETARY);
      const date = todayIso();
      const open = store.memberPositions.filter((row) => row.memberId === 9 && row.endedOn === null);
      expect(open.length).toBeGreaterThan(0);

      await firstValueFrom(
        repository.transfer(9, {
          kind: 'EXTERNAL',
          externalDestinationName: 'Iglesia Bautista El Redil',
          transferDate: date,
          reason: 'Otro',
        }),
      );

      const rows = store.memberPositions.filter((row) => open.some((item) => item.id === row.id));
      expect(rows.every((row) => row.endedOn === date)).toBe(true);
      expect(store.openPositionNames(9)).toEqual([]);
      const audits = db.auditLogs.filter(
        (log) => log.entity === 'MemberPosition' && open.some((row) => String(row.id) === log.entityId),
      );
      expect(audits).toHaveLength(open.length);
      expect(audits.every((log) => Object.keys(log.changes ?? {}).join() === 'endedOn')).toBe(true);
    });

    it('rejects the current sede, inactive members, other denominations and future dates', async () => {
      const { repository } = await setup(SECRETARY);
      const today = todayIso();
      const internal = (
        memberId: number,
        destinationCongregationId: number,
        transferDate = today,
      ) =>
        repository.transfer(memberId, {
          kind: 'INTERNAL',
          destinationCongregationId,
          transferDate,
          reason: 'Otro',
        });

      expect((await failure(internal(4, 1))).code).toBe('SAME_CONGREGATION');
      expect((await failure(internal(11, 2))).code).toBe('MEMBER_NOT_ACTIVE');
      expect((await failure(internal(4, 4))).code).toBe('INVALID_DESTINATION');
      expect((await failure(internal(4, 2, '2999-01-01'))).code).toBe('INVALID_DATE');
      expect((await failure(internal(4, 2, '2010-01-01'))).code).toBe('INVALID_DATE');
    });
  });

  describe('data consent', () => {
    it('registers the revocation once and audits CONSENT_REVOKED', async () => {
      const { repository, db } = await setup(SECRETARY);
      const [consent] = await firstValueFrom(repository.consents(4));
      expect(consent.revokedAt).toBeNull();

      await firstValueFrom(repository.revokeConsent(4, consent.id));
      const [revoked] = await firstValueFrom(repository.consents(4));
      expect(revoked.revokedAt).not.toBeNull();
      expect(db.auditLogs.at(-1)).toMatchObject({
        entity: 'DataConsent',
        action: 'CONSENT_REVOKED',
        changes: { anonymizationPending: { from: false, to: true } },
      });

      expect((await failure(repository.revokeConsent(4, consent.id))).code).toBe('ALREADY_REVOKED');
    });

    it('does not revoke a consent of another person', async () => {
      const { repository } = await setup(SECRETARY);
      expect((await failure(repository.revokeConsent(4, 6))).code).toBe('NOT_FOUND');
    });
  });

  describe('family, studies and positions', () => {
    it('rejects self relations, repeated relatives and a second father', async () => {
      const { repository } = await setup(SECRETARY);

      expect(
        (await failure(repository.addFamilyRelation(4, { relativeId: 4, type: 'CHILD' }))).code,
      ).toBe('INVALID_RELATION');
      expect(
        (await failure(repository.addFamilyRelation(4, { relativeId: 15, type: 'GUARDIAN' }))).code,
      ).toBe('DUPLICATE_RELATION');
      expect(
        (await failure(repository.addFamilyRelation(4, { relativeId: 7, type: 'FATHER' }))).code,
      ).toBe('PARENT_ALREADY_SET');

      await firstValueFrom(repository.addFamilyRelation(4, { relativeId: 18, type: 'CHILD' }));
      const family = await firstValueFrom(repository.family(4));
      expect(family.map((row) => row.relativeId)).toContain(18);
    });

    it('requires the year of a completed study', async () => {
      const { repository } = await setup(SECRETARY);
      const error = await failure(
        repository.addStudy(4, {
          studyTypeCode: 'COURSE',
          name: 'Consejería familiar',
          institution: null,
          status: 'COMPLETED',
          year: null,
        }),
      );
      expect(error.code).toBe('VALIDATION');
    });

    it('does not open the same position twice and validates the closing date', async () => {
      const { repository } = await setup(SECRETARY);

      expect(
        (await failure(repository.assignPosition(4, { positionId: 6, startedOn: '2026-01-01' })))
          .code,
      ).toBe('DUPLICATE_POSITION');
      expect((await failure(repository.closePosition(4, 1, '2019-01-01'))).code).toBe(
        'INVALID_DATE',
      );
      expect((await failure(repository.closePosition(4, 2, todayIso()))).code).toBe(
        'POSITION_ALREADY_CLOSED',
      );

      await firstValueFrom(repository.closePosition(4, 1, todayIso()));
      const view = await firstValueFrom(repository.positions(4));
      expect(view.positions.every((row) => row.endedOn !== null)).toBe(true);
    });
  });
});
