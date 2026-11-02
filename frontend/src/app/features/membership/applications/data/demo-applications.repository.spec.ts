import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { UserRoleAssignment } from '../../../../core/models/identity.model';
import { DemoApplicationsRepository } from './demo-applications.repository';

const SECRETARY_CENTRAL = 'marta.castillo@montedesion.example';
const TREASURER_CENTRAL = 'jorge.ramirez@montedesion.example';
const DENOMINATION_ADMIN = 'andres.molina@montedesion.example';
const VIDA_NUEVA_ADMIN = 'ricardo.leon@vidanueva.example';

interface Context {
  readonly auth: AuthService;
  readonly db: DemoDatabase;
  readonly repository: DemoApplicationsRepository;
}

async function signIn(email: string, prepare?: (db: DemoDatabase) => void): Promise<Context> {
  sessionStorage.clear();
  TestBed.configureTestingModule({
    providers: [{ provide: AuthGateway, useClass: DemoAuthGateway }, DemoApplicationsRepository],
  });
  const db = TestBed.inject(DemoDatabase);
  prepare?.(db);
  const auth = TestBed.inject(AuthService);
  await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  return { auth, db, repository: TestBed.inject(DemoApplicationsRepository) };
}

async function failure(source: Observable<unknown>): Promise<DomainError> {
  const error = await firstValueFrom(source).then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error).toBeInstanceOf(DomainError);
  return error as DomainError;
}

/** Test-only role so a user can review applications in another scope. */
function grantSecretary(
  db: DemoDatabase,
  userId: number,
  denominationId: number,
  congregationId: number | null,
): void {
  const role: UserRoleAssignment = {
    id: db.nextId(db.userRoles),
    userId,
    role: 'SECRETARY',
    scope: congregationId === null ? 'DENOMINATION' : 'CONGREGATION',
    denominationId,
    congregationId,
    grantedById: 1,
    createdAt: '2026-11-01T12:00:00Z',
    revokedAt: null,
  };
  db.userRoles.push(role);
}

describe('DemoApplicationsRepository', () => {
  describe('tenant isolation', () => {
    it('lists only the applications of the active sede, with counts per chip', async () => {
      const { repository } = await signIn(SECRETARY_CENTRAL);

      const queue = await firstValueFrom(repository.list('ALL'));

      expect(queue.items.every((item) => item.congregationId === 1)).toBe(true);
      expect(queue.items.map((item) => item.id).sort((a, b) => a - b)).toEqual([
        1, 2, 3, 4, 5, 6, 7, 8,
      ]);
      expect(queue.counts).toEqual({ PENDING: 6, DUPLICATE: 0, APPROVED: 1, REJECTED: 1, ALL: 8 });

      const pending = await firstValueFrom(repository.list('PENDING'));
      expect(pending.items.map((item) => item.status)).toContain('IN_REVIEW');
      expect(
        pending.items.every((item) => item.status === 'PENDING' || item.status === 'IN_REVIEW'),
      ).toBe(true);
    });

    it('answers NOT_FOUND for applications of another sede or denomination', async () => {
      const { repository } = await signIn(SECRETARY_CENTRAL);

      expect((await failure(repository.get(9))).code).toBe('NOT_FOUND');
      expect((await failure(repository.get(11))).code).toBe('NOT_FOUND');
      expect((await failure(repository.approve(9))).code).toBe(
        'NOT_FOUND',
      );
      expect((await failure(repository.reject(11, 'Motivo suficiente'))).code).toBe('NOT_FOUND');
      expect((await failure(repository.startReview(10))).code).toBe('NOT_FOUND');
    });

    it('shows every sede of the denomination, and only it, on the denomination-wide scope', async () => {
      const { auth, repository } = await signIn(DENOMINATION_ADMIN, (db) =>
        grantSecretary(db, 2, 1, null),
      );
      const wholeDenomination = auth
        .user()!
        .selectableScopes.find((scope) => scope.kind === 'DENOMINATION')!;
      auth.selectScope(wholeDenomination);

      const queue = await firstValueFrom(repository.list('ALL'));

      expect(new Set(queue.items.map((item) => item.congregationId))).toEqual(new Set([1, 2]));
      expect(queue.items.some((item) => item.id === 11)).toBe(false);
    });

    it('rejects users without applications.review', async () => {
      const { repository } = await signIn(TREASURER_CENTRAL);

      expect((await failure(repository.list('PENDING'))).code).toBe('FORBIDDEN');
      expect((await failure(repository.approve(1))).code).toBe(
        'FORBIDDEN',
      );
    });
  });

  describe('duplicate detection (C-03)', () => {
    it('finds the person with the same document in the denomination, with sede and member code', async () => {
      const { repository } = await signIn(SECRETARY_CENTRAL);

      const detail = await firstValueFrom(repository.get(3));
      const queue = await firstValueFrom(repository.list('PENDING'));

      expect(detail.duplicateMatch).toMatchObject({
        personId: 5,
        congregationName: 'Sede Norte',
        memberId: 5,
        memberCode: 'SN-0064',
        memberStatus: 'ACTIVE',
      });
      expect(queue.items.find((item) => item.id === 3)?.hasDuplicateMatch).toBe(true);
      expect(queue.items.find((item) => item.id === 1)?.hasDuplicateMatch).toBe(false);
    });

    it('ignores persons of another denomination with the same document', async () => {
      const { db, repository } = await signIn(VIDA_NUEVA_ADMIN, (database) => {
        grantSecretary(database, 8, 2, null);
        const template = database.membershipApplications.find((app) => app.id === 11)!;
        database.membershipApplications.push({
          ...template,
          id: 99,
          documentTypeCode: 'CC',
          documentNumber: '1023456789',
        });
      });
      expect(db.person(5)?.documentNumber).toBe('1023456789');

      const detail = await firstValueFrom(repository.get(99));

      expect(detail.duplicateMatch).toBeNull();
    });

    it('never approves an application whose document belongs to a person of the denomination', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);
      const members = db.members.length;
      const persons = db.persons.length;

      const error = await failure(repository.approve(3));

      expect(error.code).toBe('DUPLICATE_DOCUMENT');
      expect(db.members.length).toBe(members);
      expect(db.persons.length).toBe(persons);
      expect(
        db.persons.filter((person) => person.denominationId === 1 && person.documentTypeCode === 'CC' && person.documentNumber === '1023456789'),
      ).toHaveLength(1);
      expect(db.membershipApplications.find((app) => app.id === 3)?.status).toBe('PENDING');
    });

    it('marks as duplicate linked to the matched person, with reviewer and date', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);

      const detail = await firstValueFrom(repository.markDuplicate(3, 5));
      const stored = db.membershipApplications.find((app) => app.id === 3)!;

      expect(detail.status).toBe('DUPLICATE');
      expect(detail.linkedPerson?.personId).toBe(5);
      expect(stored).toMatchObject({ status: 'DUPLICATE', matchedPersonId: 5, reviewerId: 4 });
      expect(stored.reviewedAt).not.toBeNull();
      expect((await failure(repository.markDuplicate(1, 5))).code).toBe('INVALID_MATCH');
    });
  });

  describe('approval (C-04)', () => {
    it('creates person, member, registry entry with the next number, consent and audit at once', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);
      const expectedNumber =
        Math.max(
          ...db.memberRegistryEntries
            .filter((entry) => entry.congregationId === 1)
            .map((e) => e.memberNumber),
        ) + 1;
      const application = db.membershipApplications.find((app) => app.id === 1)!;

      const result = await firstValueFrom(repository.approve(1));

      const member = db.members.find((item) => item.id === result.memberId)!;
      const person = db.person(member.personId)!;
      const entry = db.currentRegistryEntry(member.id)!;
      const consent = db.dataConsents.find((item) => item.personId === person.id)!;
      const stored = db.membershipApplications.find((app) => app.id === 1)!;

      expect(result.memberNumber).toBe(expectedNumber);
      expect(result.memberCode).toBe(`SC-${String(expectedNumber).padStart(4, '0')}`);
      expect(person).toMatchObject({
        denominationId: 1,
        documentTypeCode: 'CC',
        documentNumber: '1019876543',
        firstName: 'Valentina',
        sex: 'FEMALE',
        maritalStatusCode: 'SINGLE',
        municipalityCode: '11001',
      });
      expect(member).toMatchObject({ status: 'ACTIVE', congregationId: 1, denominationId: 1 });
      expect(member.joinedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(entry).toMatchObject({
        congregationId: 1,
        memberNumber: expectedNumber,
        registryBook: String(1 + Math.floor(expectedNumber / 100)),
        registryFolio: String((expectedNumber % 100) + 1),
        endedOn: null,
      });
      expect(consent).toMatchObject({
        channel: 'WEB_FORM',
        policyId: 1,
        grantedAt: application.consentedAt,
      });
      expect(stored).toMatchObject({ status: 'APPROVED', memberId: member.id, reviewerId: 4 });
      expect(stored.reviewedAt).not.toBeNull();

      const audit = db.auditLogs.at(-1)!;
      expect(audit).toMatchObject({
        action: 'APPLICATION_APPROVED',
        entity: 'MembershipApplication',
        entityId: '1',
      });
      expect(JSON.stringify(audit.changes)).not.toContain('Valentina');
    });

    it('links the consent of a minor to a new guardian person of the denomination', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);
      const persons = db.persons.length;

      const result = await firstValueFrom(repository.approve(2));

      const member = db.members.find((item) => item.id === result.memberId)!;
      const consent = db.dataConsents.find((item) => item.personId === member.personId)!;
      expect(consent.guardianId).not.toBeNull();
      expect(consent.guardianId).not.toBe(member.personId);
      expect(db.persons.length).toBe(persons + 2);
      expect(db.person(consent.guardianId!)).toMatchObject({
        denominationId: 1,
        documentTypeCode: 'CC',
        documentNumber: '52345678',
        firstName: 'Gloria',
        lastName: 'Cárdenas Ríos',
        phone: '311 555 0144',
      });
      expect(JSON.stringify(db.auditLogs.at(-1)!.changes)).not.toContain('Gloria');
    });

    it('reuses the guardian already registered with the same document', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);
      const guardian = db.persons.find((person) => person.denominationId === 1)!;
      db.membershipApplications.splice(
        db.membershipApplications.findIndex((app) => app.id === 2),
        1,
        {
          ...db.membershipApplications.find((app) => app.id === 2)!,
          guardianDocument: `${guardian.documentTypeCode} ${guardian.documentNumber}`,
        },
      );
      const persons = db.persons.length;

      const result = await firstValueFrom(repository.approve(2));

      const member = db.members.find((item) => item.id === result.memberId)!;
      const consent = db.dataConsents.find((item) => item.personId === member.personId)!;
      expect(consent.guardianId).toBe(guardian.id);
      expect(db.persons.length).toBe(persons + 1);
    });

    it('refuses to approve a minor without guardian data', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);
      const index = db.membershipApplications.findIndex((app) => app.id === 2);
      db.membershipApplications[index] = {
        ...db.membershipApplications[index],
        guardianName: null,
        guardianDocument: null,
      };
      const members = db.members.length;

      expect((await failure(repository.approve(2))).code).toBe('GUARDIAN_REQUIRED');
      expect(db.members.length).toBe(members);
      expect(db.membershipApplications[index].status).toBe('PENDING');
    });

    it('stores no guardian for an adult applicant', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);

      const result = await firstValueFrom(repository.approve(1));

      const member = db.members.find((item) => item.id === result.memberId)!;
      expect(db.dataConsents.find((item) => item.personId === member.personId)?.guardianId).toBeNull();
    });

    it('gives consecutive numbers to consecutive approvals', async () => {
      const { repository } = await signIn(SECRETARY_CENTRAL);

      const first = await firstValueFrom(repository.approve(1));
      const second = await firstValueFrom(repository.approve(5));

      expect(second.memberNumber).toBe(first.memberNumber + 1);
    });
  });

  describe('transitions', () => {
    it('takes a pending application into review and assigns the reviewer', async () => {
      const { repository } = await signIn(SECRETARY_CENTRAL);

      const detail = await firstValueFrom(repository.startReview(1));

      expect(detail.status).toBe('IN_REVIEW');
      expect(detail.reviewerName).toBe('Marta Castillo');
      expect((await failure(repository.startReview(1))).code).toBe('INVALID_TRANSITION');
    });

    it('only resolves PENDING or IN_REVIEW applications', async () => {
      const { repository } = await signIn(SECRETARY_CENTRAL);

      expect((await failure(repository.approve(7))).code).toBe(
        'INVALID_TRANSITION',
      );
      expect((await failure(repository.reject(8, 'Motivo suficiente'))).code).toBe(
        'INVALID_TRANSITION',
      );
      expect((await failure(repository.markDuplicate(7, 4))).code).toBe('INVALID_TRANSITION');

      const approved = await firstValueFrom(repository.approve(4));
      expect(approved.memberId).toBeGreaterThan(0);
    });

    it('requires a rejection reason of at most 255 characters', async () => {
      const { db, repository } = await signIn(SECRETARY_CENTRAL);

      expect((await failure(repository.reject(1, '   '))).code).toBe('REJECTION_REASON_REQUIRED');
      expect((await failure(repository.reject(1, 'x'.repeat(256)))).code).toBe(
        'REJECTION_REASON_TOO_LONG',
      );
      expect(db.membershipApplications.find((app) => app.id === 1)?.status).toBe('PENDING');

      const detail = await firstValueFrom(repository.reject(1, '  Documento ilegible  '));

      expect(detail).toMatchObject({ status: 'REJECTED', rejectionReason: 'Documento ilegible' });
      expect(db.auditLogs.at(-1)).toMatchObject({ action: 'APPLICATION_REJECTED' });
    });
  });
});
