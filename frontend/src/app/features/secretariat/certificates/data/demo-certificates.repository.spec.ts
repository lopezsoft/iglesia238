import { TestBed } from '@angular/core/testing';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthGateway } from '../../../../core/auth/auth.gateway';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoAuthGateway } from '../../../../core/auth/demo-auth.gateway';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_PASSWORD } from '../../../../core/demo/demo-fixtures';
import { DomainError } from '../../../../core/errors/domain-error';
import { CertificateTypeOption } from './certificates.models';
import { CERTIFICATES_TODAY, CertificatesRepository } from './certificates.repository';
import { DemoCertificatesRepository } from './demo-certificates.repository';

const SECRETARY_CENTRAL = 'marta.castillo@montedesion.example';
const SECRETARY_NORTE = 'paola.ruiz@montedesion.example';
const TREASURER_CENTRAL = 'jorge.ramirez@montedesion.example';
const ADMIN_DENOMINATION_1 = 'andres.molina@montedesion.example';
const ADMIN_DENOMINATION_2 = 'ricardo.leon@vidanueva.example';

/** Ana María Rojas: active and baptized member of Sede Central. */
const CENTRAL_MEMBER = 4;
/** Active member of Sede Central without water baptism in the fixtures. */
const CENTRAL_NOT_BAPTIZED = 23;
const CENTRAL_INACTIVE = 11;
const NORTE_MEMBER = 5;
const OTHER_DENOMINATION_MEMBER = 48;

interface Setup {
  readonly repo: CertificatesRepository;
  readonly auth: AuthService;
  readonly db: DemoDatabase;
  setToday(date: string): void;
}

function setup(): Setup {
  sessionStorage.clear();
  let today = '2026-11-02';
  TestBed.configureTestingModule({
    providers: [
      { provide: AuthGateway, useClass: DemoAuthGateway },
      { provide: CertificatesRepository, useClass: DemoCertificatesRepository },
      { provide: CERTIFICATES_TODAY, useValue: () => today },
    ],
  });
  return {
    repo: TestBed.inject(CertificatesRepository),
    auth: TestBed.inject(AuthService),
    db: TestBed.inject(DemoDatabase),
    setToday: (date) => (today = date),
  };
}

async function login(
  auth: AuthService,
  email: string,
  congregationId?: number | null,
): Promise<void> {
  const user = await firstValueFrom(auth.login(email, DEMO_PASSWORD));
  if (congregationId !== undefined) {
    const scope = user.selectableScopes.find((item) => item.congregationId === congregationId);
    if (!scope) {
      throw new Error(`Scope ${congregationId} not available`);
    }
    auth.selectScope(scope);
  }
}

async function errorCode(source: Observable<unknown>): Promise<string> {
  try {
    await firstValueFrom(source);
  } catch (error) {
    return error instanceof DomainError ? error.code : 'UNEXPECTED';
  }
  return 'NO_ERROR';
}

async function typeId(repo: CertificatesRepository, code: string): Promise<number> {
  const context = await firstValueFrom(repo.issuingContext());
  const type = context.types.find((item: CertificateTypeOption) => item.code === code);
  if (!type) {
    throw new Error(`Type ${code} not seeded`);
  }
  return type.id;
}

describe('DemoCertificatesRepository', () => {
  describe('numbering', () => {
    it('continues each series of the sede without gaps and shows the next number', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const context = await firstValueFrom(repo.issuingContext());
      expect(context.types.map((type) => type.nextNumber)).toEqual([
        'CERT-MEM-2026-0032',
        'CERT-TRA-2026-0008',
        'CERT-BAU-2026-0015',
        'CERT-ASI-2026-0011',
      ]);
      const mem = await typeId(repo, 'MEM');
      const bau = await typeId(repo, 'BAU');

      const first = await firstValueFrom(
        repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: mem, notes: null }),
      );
      const second = await firstValueFrom(
        repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: mem, notes: null }),
      );
      const baptism = await firstValueFrom(
        repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: bau, notes: null }),
      );

      expect([first.number, second.number, baptism.number]).toEqual([
        'CERT-MEM-2026-0032',
        'CERT-MEM-2026-0033',
        'CERT-BAU-2026-0015',
      ]);
    });

    it('keeps a separate series per sede', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_NORTE, 2);
      const mem = await typeId(repo, 'MEM');
      const issued = await firstValueFrom(
        repo.issueCertificate({ memberId: NORTE_MEMBER, certificateTypeId: mem, notes: null }),
      );
      expect(issued.number).toBe('CERT-MEM-2026-0005');
    });

    it('starts again at 0001 in a new year', async () => {
      const { repo, auth, setToday } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const mem = await typeId(repo, 'MEM');
      setToday('2027-01-04');
      const issued = await firstValueFrom(
        repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: mem, notes: null }),
      );
      expect(issued.number).toBe('CERT-MEM-2027-0001');
    });

    it('does not consume a number when the request is rejected', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const mem = await typeId(repo, 'MEM');
      expect(
        await errorCode(
          repo.issueCertificate({ memberId: NORTE_MEMBER, certificateTypeId: mem, notes: null }),
        ),
      ).toBe('MEMBER_NOT_IN_SEDE');
      const issued = await firstValueFrom(
        repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: mem, notes: null }),
      );
      expect(issued.number).toBe('CERT-MEM-2026-0032');
    });
  });

  describe('issue rules', () => {
    it('only issues to active members of the active sede', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const mem = await typeId(repo, 'MEM');
      expect(
        await errorCode(
          repo.issueCertificate({ memberId: NORTE_MEMBER, certificateTypeId: mem, notes: null }),
        ),
      ).toBe('MEMBER_NOT_IN_SEDE');
      expect(
        await errorCode(
          repo.issueCertificate({
            memberId: CENTRAL_INACTIVE,
            certificateTypeId: mem,
            notes: null,
          }),
        ),
      ).toBe('MEMBER_NOT_ACTIVE');
    });

    it('requires a registered baptism for the baptism certificate', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const bau = await typeId(repo, 'BAU');
      expect(
        await errorCode(
          repo.issueCertificate({
            memberId: CENTRAL_NOT_BAPTIZED,
            certificateTypeId: bau,
            notes: null,
          }),
        ),
      ).toBe('MEMBER_NOT_BAPTIZED');
    });

    it('keeps the printed snapshot when the member data changes later', async () => {
      const { repo, auth, db } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const mem = await typeId(repo, 'MEM');
      const issued = await firstValueFrom(
        repo.issueCertificate({
          memberId: CENTRAL_MEMBER,
          certificateTypeId: mem,
          notes: 'Para trámite de visa.',
        }),
      );
      const person = db.persons.find((item) => item.id === CENTRAL_MEMBER)!;
      db.replace(db.persons, { ...person, firstName: 'Nombre Cambiado' });

      const detail = await firstValueFrom(repo.getCertificate(issued.id));
      expect(detail.snapshot.memberName).toBe(issued.memberName);
      expect(detail.snapshot.body).not.toContain('Nombre Cambiado');
      expect(detail.snapshot.notes).toBe('Para trámite de visa.');
      expect(detail.snapshot.pastorName).toBe('Pastor Daniel Herrera');
      expect(detail.snapshot.taxId).toBe('900.123.456-7');
    });

    it('rejects issuing without the certificates.issue permission', async () => {
      const { repo, auth } = setup();
      await login(auth, TREASURER_CENTRAL);
      expect(
        await errorCode(
          repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: 1, notes: null }),
        ),
      ).toBe('FORBIDDEN');
    });

    it('asks for a sede when the scope is the whole denomination', async () => {
      const { repo, auth } = setup();
      await login(auth, ADMIN_DENOMINATION_1, null);
      expect(await errorCode(repo.issuingContext())).toBe('CONGREGATION_REQUIRED');
    });

    it('searches only active members of the active sede', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const results = await firstValueFrom(repo.searchMembers('a'));
      const ids = results.map((item) => item.id);
      expect(ids.length).toBeGreaterThan(0);
      expect(ids).not.toContain(NORTE_MEMBER);
      expect(ids).not.toContain(CENTRAL_INACTIVE);
      expect(await errorCode(repo.findMember(NORTE_MEMBER))).toBe('MEMBER_NOT_IN_SEDE');
    });
  });

  describe('void', () => {
    it('requires a reason, keeps the number and cannot void twice', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const mem = await typeId(repo, 'MEM');
      const issued = await firstValueFrom(
        repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: mem, notes: null }),
      );

      expect(await errorCode(repo.voidCertificate({ id: issued.id, reason: '  corto ' }))).toBe(
        'VOID_REASON_REQUIRED',
      );
      const voided = await firstValueFrom(
        repo.voidCertificate({ id: issued.id, reason: 'Error en el número de documento.' }),
      );
      expect(voided.status).toBe('VOIDED');
      expect(voided.number).toBe(issued.number);
      expect(
        await errorCode(repo.voidCertificate({ id: issued.id, reason: 'Otro motivo suficiente.' })),
      ).toBe('CERTIFICATE_ALREADY_VOIDED');

      const next = await firstValueFrom(
        repo.issueCertificate({ memberId: CENTRAL_MEMBER, certificateTypeId: mem, notes: null }),
      );
      expect(next.number).toBe('CERT-MEM-2026-0033');
    });
  });

  describe('tenant isolation', () => {
    it('lists only the certificates of the active sede', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_NORTE, 2);
      const page = await firstValueFrom(
        repo.listCertificates({ typeCode: null, status: null, page: 1, pageSize: 100 }),
      );
      expect(page.total).toBe(5);
      expect(page.items.every((item) => item.number.startsWith('CERT-'))).toBe(true);
      expect(await errorCode(repo.getCertificate(31))).toBe('CERTIFICATE_NOT_FOUND');
    });

    it('never returns rows of another denomination', async () => {
      const { repo, auth } = setup();
      await login(auth, ADMIN_DENOMINATION_2, null);
      const page = await firstValueFrom(
        repo.listCertificates({ typeCode: null, status: null, page: 1, pageSize: 100 }),
      );
      expect(page.total).toBe(3);
      expect(await errorCode(repo.getCertificate(31))).toBe('CERTIFICATE_NOT_FOUND');
      const cards = await firstValueFrom(repo.listCards({ status: null, page: 1, pageSize: 100 }));
      expect(cards.items.every((card) => card.cardNumber.startsWith('VN'))).toBe(true);
    });

    it('does not reveal members of another denomination', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      expect(await errorCode(repo.findMember(OTHER_DENOMINATION_MEMBER))).toBe('MEMBER_NOT_FOUND');
    });
  });

  describe('membership cards', () => {
    it('refuses a second valid card until the previous one is voided', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const valid = await firstValueFrom(
        repo.listCards({ status: 'VALID', page: 1, pageSize: 100 }),
      );
      const holder = valid.items[0];
      const command = {
        memberId: holder.memberId,
        issuedOn: '2026-11-02',
        expiresOn: '2028-11-02',
      };

      expect(await errorCode(repo.issueCard(command))).toBe('ACTIVE_CARD_EXISTS');
      const candidates = await firstValueFrom(repo.cardCandidates());
      expect(candidates.map((item) => item.memberId)).not.toContain(holder.memberId);

      await firstValueFrom(
        repo.voidCard({ id: holder.id, reason: 'Carné extraviado por el miembro.' }),
      );
      const card = await firstValueFrom(repo.issueCard(command));
      expect(card.status).toBe('VALID');
      expect(card.cardNumber).toBe(holder.cardNumber);
    });

    it('requires the expiry after the issue date', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const [candidate] = await firstValueFrom(repo.cardCandidates());
      expect(
        await errorCode(
          repo.issueCard({
            memberId: candidate.memberId,
            issuedOn: '2026-11-02',
            expiresOn: '2026-11-02',
          }),
        ),
      ).toBe('INVALID_EXPIRY');
    });

    it('computes valid and expired from today', async () => {
      const { repo, auth, setToday } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const [candidate] = await firstValueFrom(repo.cardCandidates());
      const card = await firstValueFrom(
        repo.issueCard({
          memberId: candidate.memberId,
          issuedOn: '2026-11-02',
          expiresOn: '2028-11-02',
        }),
      );
      expect(card.status).toBe('VALID');

      setToday('2028-11-03');
      const expired = await firstValueFrom(
        repo.listCards({ status: 'EXPIRED', page: 1, pageSize: 500 }),
      );
      expect(expired.items.map((item) => item.id)).toContain(card.id);
    });

    it('rejects a future issue date and a card already expired on issue', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      const [candidate] = await firstValueFrom(repo.cardCandidates());
      expect(
        await errorCode(
          repo.issueCard({
            memberId: candidate.memberId,
            issuedOn: '2027-06-01',
            expiresOn: '2029-06-01',
          }),
        ),
      ).toBe('INVALID_DATE');
      expect(
        await errorCode(
          repo.issueCard({
            memberId: candidate.memberId,
            issuedOn: '2020-01-01',
            expiresOn: '2022-01-01',
          }),
        ),
      ).toBe('INVALID_DATE');
      const candidates = await firstValueFrom(repo.cardCandidates());
      expect(candidates.map((item) => item.memberId)).toContain(candidate.memberId);
    });

    it('lets the new sede issue a card after an internal transfer and voids the old one', async () => {
      const { repo, auth, db } = setup();
      await login(auth, SECRETARY_NORTE, 2);
      const [oldCard] = (
        await firstValueFrom(repo.listCards({ status: 'VALID', page: 1, pageSize: 100 }))
      ).items;

      // Internal transfer to Sede Central, as DemoMembersRepository does it.
      const member = db.members.find((item) => item.id === oldCard.memberId)!;
      const entry = db.currentRegistryEntry(member.id)!;
      db.replace(db.memberRegistryEntries, { ...entry, endedOn: '2026-11-01' });
      db.memberRegistryEntries.push({
        ...entry,
        id: db.nextId(db.memberRegistryEntries),
        congregationId: 1,
        memberNumber: 9001,
        startedOn: '2026-11-01',
        endedOn: null,
      });
      db.replace(db.members, { ...member, congregationId: 1 });

      await login(auth, SECRETARY_CENTRAL);
      const candidates = await firstValueFrom(repo.cardCandidates());
      expect(candidates.map((item) => item.memberId)).toContain(member.id);
      const card = await firstValueFrom(
        repo.issueCard({ memberId: member.id, issuedOn: '2026-11-02', expiresOn: '2028-11-02' }),
      );
      expect(card.status).toBe('VALID');
      expect(card.cardNumber).not.toBe(oldCard.cardNumber);

      await login(auth, SECRETARY_NORTE, 2);
      const norteCards = await firstValueFrom(
        repo.listCards({ status: null, page: 1, pageSize: 100 }),
      );
      expect(norteCards.items.find((item) => item.id === oldCard.id)?.status).toBe('VOIDED');
    });

    it('only issues cards to members of the active sede', async () => {
      const { repo, auth } = setup();
      await login(auth, SECRETARY_CENTRAL);
      expect(
        await errorCode(
          repo.issueCard({
            memberId: NORTE_MEMBER,
            issuedOn: '2026-11-02',
            expiresOn: '2028-11-02',
          }),
        ),
      ).toBe('MEMBER_NOT_IN_SEDE');
    });
  });
});
