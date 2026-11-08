import type {
  AuditEntry,
  AuditRecorder,
} from '../../../../common/audit/audit-recorder.port.js';
import { DocumentNumberingService } from '../../../../common/numbering/document-numbering.service.js';
import type { DocumentSequenceStore } from '../../../../common/numbering/document-sequence.store.js';
import { buildPage, type Page } from '../../../../common/pagination/page.js';
import type {
  Transaction,
  TransactionRunner,
} from '../../../../common/persistence/transaction.js';
import { TenantScope } from '../../../../common/tenancy/tenant-scope.js';
import { Clock } from '../../../../common/time/bogota-time.js';
import { buildTenantContext } from '../../../../../test/support/tenants.js';
import { formatMemberCode } from '../../../../common/numbering/document-numbering.service.js';
import type { BrandingSnapshot, Letterhead } from '../certificate-document.js';
import { DocumentBrandingService } from '../document-branding.service.js';
import {
  StorageUnavailableError,
  type FileStorage,
} from '../../../../common/storage/file-storage.port.js';
import type { CertificateBrandingReader } from '../ports/certificate-branding.reader.js';
import type {
  CardCandidateRecord,
  CardFilter,
  CardRecord,
  CertificateFilter,
  CertificateMember,
  CertificateRecord,
  CertificateTypeChanges,
  CertificateTypeRecord,
  PageParams,
  ResolvedSigners,
} from '../certificate.models.js';
import { cardStatusOf } from '../certificate-mappers.js';
import type { CertificateContextReader } from '../ports/certificate-context.reader.js';
import type { CertificateMemberReader } from '../ports/certificate-member.reader.js';
import type { CertificateMemberSearch } from '../ports/certificate-member.search.js';
import { toMemberOption } from '../certificate-mappers.js';
import type {
  CertificateRepository,
  NewCertificate,
} from '../ports/certificate.repository.js';
import type {
  CertificateDonationReader,
  DonationLineRecord,
} from '../ports/certificate-donation.reader.js';
import type {
  CertificateVerificationLinks,
  CertificateVerificationReader,
  VerifiableCertificateRecord,
} from '../ports/certificate-verification.js';
import type {
  CardPdfInput,
  CertificatePdfInput,
  DocumentPdfRenderer,
} from '../ports/document-pdf.renderer.js';
import type {
  CardCounts,
  MembershipCardRepository,
  NewMembershipCard,
} from '../ports/membership-card.repository.js';
import { addDays } from '../certificate-document.js';
import { CertificateDraftService } from '../use-cases/certificate-draft.service.js';
import { ExportCertificatesUseCase } from '../use-cases/export-certificates.use-case.js';
import { GetCertificateUseCase } from '../use-cases/get-certificate.use-case.js';
import { GetCertificatesSummaryUseCase } from '../use-cases/get-certificates-summary.use-case.js';
import { GetIssuingContextUseCase } from '../use-cases/get-issuing-context.use-case.js';
import { IssueCardUseCase } from '../use-cases/issue-card.use-case.js';
import { IssueCertificateUseCase } from '../use-cases/issue-certificate.use-case.js';
import { ListCardCandidatesUseCase } from '../use-cases/list-card-candidates.use-case.js';
import { ListCardsUseCase } from '../use-cases/list-cards.use-case.js';
import { ListCertificateTypesUseCase } from '../use-cases/list-certificate-types.use-case.js';
import { ListCertificatesUseCase } from '../use-cases/list-certificates.use-case.js';
import { PreviewCertificateUseCase } from '../use-cases/preview-certificate.use-case.js';
import { RenderCardPdfUseCase } from '../use-cases/render-card-pdf.use-case.js';
import { RenderCertificatePdfUseCase } from '../use-cases/render-certificate-pdf.use-case.js';
import {
  ListCertificateTypeTemplatesUseCase,
  PreviewCertificateTemplateUseCase,
  UpdateCertificateTypeUseCase,
} from '../use-cases/certificate-type-templates.use-cases.js';
import { VerifyCertificateUseCase } from '../use-cases/verify-certificate.use-case.js';
import {
  FindCertificateMemberUseCase,
  SearchCertificateMembersUseCase,
} from '../use-cases/search-certificate-members.use-case.js';
import { VoidCardUseCase } from '../use-cases/void-card.use-case.js';
import { VoidCertificateUseCase } from '../use-cases/void-certificate.use-case.js';

export class FixedClock extends Clock {
  constructor(private instant: Date) {
    super();
  }
  now(): Date {
    return this.instant;
  }
  set(iso: string): void {
    this.instant = new Date(iso);
  }
}

class FakeTransactionRunner implements TransactionRunner {
  /** Undo functions of the writes of the open transaction, run in reverse when the work throws. */
  readonly undo: Array<() => void> = [];
  readonly handle: Transaction = { kind: 'transaction' };

  async run<T>(work: (transaction: Transaction) => Promise<T>): Promise<T> {
    const start = this.undo.length;
    try {
      return await work(this.handle);
    } catch (error) {
      while (this.undo.length > start) {
        this.undo.pop()?.();
      }
      throw error;
    }
  }
}

class FakeSequenceStore implements DocumentSequenceStore {
  readonly counters = new Map<string, number>();

  constructor(private readonly transactions: FakeTransactionRunner) {}

  next(scope: TenantScope, key: string): Promise<number> {
    const id = counterId(scope, key);
    const previous = this.counters.get(id) ?? 0;
    this.counters.set(id, previous + 1);
    this.transactions.undo.push(() => this.counters.set(id, previous));
    return Promise.resolve(previous + 1);
  }
}

const counterId = (scope: TenantScope, key: string) =>
  `${scope.denominationId}/${scope.congregationId}/${key}`;

export class RecordingAudit implements AuditRecorder {
  readonly entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

export class FakePdfRenderer implements DocumentPdfRenderer {
  readonly certificates: CertificatePdfInput[] = [];
  readonly cards: CardPdfInput[] = [];
  certificate(input: CertificatePdfInput): Promise<Buffer> {
    this.certificates.push(input);
    return Promise.resolve(Buffer.from('%PDF-certificate'));
  }
  card(input: CardPdfInput): Promise<Buffer> {
    this.cards.push(input);
    return Promise.resolve(Buffer.from('%PDF-card'));
  }
}

/** Verification links of the tests: `<id>.sig` is the only token that checks out. */
export class FakeVerificationLinks implements CertificateVerificationLinks {
  linkFor(certificateId: number): string {
    return `https://app.test/verify-certificate?t=${certificateId}.sig`;
  }
  certificateIdOf(token: string): number | null {
    const match = /^(\d+)\.sig$/.exec(token);
    return match ? Number(match[1]) : null;
  }
}

/** Donations of the tests: whatever the test arranged in `data.donations`, keyed by member and year. */
class FakeDonationReader implements CertificateDonationReader {
  constructor(private readonly data: FakeData) {}
  summarize(
    _scope: TenantScope,
    memberId: number,
    range: { from: string; to: string },
  ) {
    this.data.donationQueries.push({ memberId, ...range });
    return Promise.resolve(
      this.data.donations
        .filter(
          (d) =>
            d.memberId === memberId &&
            d.receivedOn >= range.from &&
            d.receivedOn <= range.to,
        )
        .reduce<DonationLineRecord[]>((lines, d) => {
          const line = lines.find((l) => l.concept === d.concept);
          if (line) {
            lines[lines.indexOf(line)] = {
              ...line,
              receipts: line.receipts + 1,
              amountCents: line.amountCents + d.amountCents,
            };
          } else {
            lines.push({
              concept: d.concept,
              receipts: 1,
              amountCents: d.amountCents,
            });
          }
          return lines;
        }, []),
    );
  }
}

class FakeBrandingReader implements CertificateBrandingReader {
  constructor(private readonly data: FakeData) {}
  findBranding() {
    return Promise.resolve(this.data.branding);
  }
}

class FakeStorage implements FileStorage {
  constructor(private readonly data: FakeData) {}
  write(key: string, content: Buffer) {
    this.data.files.set(key, content);
    return Promise.resolve();
  }
  read(key: string) {
    if (this.data.storageFailing) {
      return Promise.reject(new StorageUnavailableError('storage down'));
    }
    return Promise.resolve(this.data.files.get(key) ?? null);
  }
}

class FakeVerificationReader implements CertificateVerificationReader {
  constructor(private readonly data: FakeData) {}
  findById(certificateId: number): Promise<VerifiableCertificateRecord | null> {
    const row = this.data.certificates.find((c) => c.id === certificateId);
    return Promise.resolve(
      row
        ? {
            snapshot: row.snapshot,
            issuedOn: row.issuedOn,
            expiresOn: row.expiresOn,
            voidedAt: row.voidedAt,
          }
        : null,
    );
  }
}

interface Owned {
  denominationId: number;
}
type Mutable<T> = { -readonly [K in keyof T]: T[K] };
type StoredCertificate = Mutable<CertificateRecord> &
  Owned & { notes: string | null };
type StoredCard = Mutable<CardRecord> & Owned;
type StoredMember = Mutable<CertificateMember> & Owned;
type StoredType = CertificateTypeRecord & Owned;

/** The tables of the fake database. Tests arrange rows here and assert on them. */
export class FakeData {
  /** The logo and color the denomination has chosen, and the files of the storage. */
  branding: BrandingSnapshot = { logoKey: null, primaryColor: null };
  files = new Map<string, Buffer>();
  storageFailing = false;
  /** Contributions of members, one row per receipt (amounts in cents). */
  donations: {
    memberId: number;
    concept: string;
    receivedOn: string;
    amountCents: number;
  }[] = [];
  donationQueries: { memberId: number; from: string; to: string }[] = [];
  types: StoredType[] = [];
  certificates: StoredCertificate[] = [];
  cards: StoredCard[] = [];
  members: StoredMember[] = [];
  congregations = new Map<
    number,
    { denominationId: number; code: string; name: string }
  >();
  letterheads = new Map<number, Letterhead>();
  signers = new Map<number, ResolvedSigners>();
  nextId = 1000;
}

const inScope = (
  scope: TenantScope,
  row: { denominationId: number; congregationId?: number },
) =>
  row.denominationId === scope.denominationId &&
  (scope.congregationId === null ||
    row.congregationId === scope.congregationId);

class FakeCertificateRepository implements CertificateRepository {
  constructor(
    private readonly data: FakeData,
    private readonly sequences: FakeSequenceStore,
    private readonly transactions: FakeTransactionRunner,
  ) {}

  listTypes(scope: TenantScope) {
    return Promise.resolve(
      this.data.types.filter((t) => t.denominationId === scope.denominationId),
    );
  }

  findType(scope: TenantScope, typeId: number) {
    return Promise.resolve(
      this.data.types.find(
        (t) => t.id === typeId && t.denominationId === scope.denominationId,
      ) ?? null,
    );
  }

  updateType(
    scope: TenantScope,
    typeId: number,
    changes: CertificateTypeChanges,
  ) {
    const index = this.data.types.findIndex(
      (t) => t.id === typeId && t.denominationId === scope.denominationId,
    );
    if (index === -1) {
      return Promise.resolve(null);
    }
    this.data.types[index] = { ...this.data.types[index], ...changes };
    return Promise.resolve(this.data.types[index]);
  }

  lastSequenceValues(scope: TenantScope, typeCodes: readonly string[]) {
    return Promise.resolve(
      new Map(
        typeCodes.map((code) => [
          code,
          this.sequences.counters.get(counterId(scope, `CERT:${code}`)) ?? 0,
        ]),
      ),
    );
  }

  insert(
    scope: TenantScope,
    input: NewCertificate,
  ): Promise<CertificateRecord> {
    const type = this.data.types.find((t) => t.id === input.certificateTypeId)!;
    const congregationId = scope.requireCongregationId();
    const row: StoredCertificate = {
      id: this.data.nextId++,
      denominationId: scope.denominationId,
      congregationId,
      congregationName: this.data.congregations.get(congregationId)!.name,
      typeId: type.id,
      typeCode: type.code,
      typeName: type.name,
      memberId: input.memberId,
      sequenceNumber: input.sequenceNumber,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      issuedByName: 'Marta Castillo',
      snapshot: input.snapshot,
      voidedAt: null,
      voidReason: null,
      notes: input.notes,
    };
    this.data.certificates.push(row);
    this.transactions.undo.push(() => {
      this.data.certificates = this.data.certificates.filter((c) => c !== row);
    });
    return Promise.resolve(row);
  }

  findById(scope: TenantScope, id: number) {
    return Promise.resolve(
      this.data.certificates.find((c) => c.id === id && inScope(scope, c)) ??
        null,
    );
  }

  private filtered(scope: TenantScope, filter: CertificateFilter) {
    const rows = this.data.certificates
      .filter((c) => inScope(scope, c))
      .filter((c) => !filter.typeCode || c.typeCode === filter.typeCode)
      .filter(
        (c) =>
          !filter.status ||
          (filter.status === 'VOIDED') === (c.voidedAt !== null),
      )
      .filter((c) => !filter.memberId || c.memberId === filter.memberId)
      .filter((c) => !filter.issuedFrom || c.issuedOn >= filter.issuedFrom)
      .filter((c) => !filter.issuedTo || c.issuedOn <= filter.issuedTo)
      .filter(
        (c) =>
          !filter.q ||
          c.snapshot.memberName
            .toLowerCase()
            .includes(filter.q.toLowerCase()) ||
          c.snapshot.number.toLowerCase() === filter.q.toLowerCase(),
      );
    const direction = filter.sort === 'issuedOn:asc' ? 1 : -1;
    return rows.sort(
      (a, b) =>
        direction * (a.issuedOn.localeCompare(b.issuedOn) || a.id - b.id),
    );
  }

  list(
    scope: TenantScope,
    filter: CertificateFilter,
    paging: PageParams,
  ): Promise<Page<CertificateRecord>> {
    const rows = this.filtered(scope, filter);
    const start = (paging.page - 1) * paging.pageSize;
    return Promise.resolve(
      buildPage(
        rows.slice(start, start + paging.pageSize),
        rows.length,
        paging,
      ),
    );
  }

  listForExport(scope: TenantScope, filter: CertificateFilter, limit: number) {
    return Promise.resolve(this.filtered(scope, filter).slice(0, limit));
  }

  markVoided(scope: TenantScope, id: number, reason: string, at: Date) {
    const row = this.data.certificates.find(
      (c) => c.id === id && inScope(scope, c) && c.voidedAt === null,
    );
    if (!row) {
      return Promise.resolve(false);
    }
    row.voidedAt = at;
    row.voidReason = reason;
    return Promise.resolve(true);
  }

  countIssued(
    scope: TenantScope,
    range: { from: string; to: string },
    typeCode?: string,
  ) {
    const rows = this.data.certificates.filter(
      (c) =>
        inScope(scope, c) &&
        c.issuedOn >= range.from &&
        c.issuedOn <= range.to &&
        (typeCode === undefined || c.typeCode === typeCode),
    );
    return Promise.resolve({
      issued: rows.length,
      voided: rows.filter((c) => c.voidedAt !== null).length,
    });
  }
}

class FakeCardRepository implements MembershipCardRepository {
  constructor(
    private readonly data: FakeData,
    private readonly transactions: FakeTransactionRunner,
  ) {}

  private filtered(scope: TenantScope, filter: CardFilter) {
    return this.data.cards
      .filter((c) => inScope(scope, c))
      .filter(
        (c) =>
          !filter.status || cardStatusOf(c, filter.today) === filter.status,
      )
      .filter(
        (c) =>
          filter.expiringInDays === undefined ||
          (cardStatusOf(c, filter.today) === 'VALID' &&
            c.expiresOn <= addDays(filter.today, filter.expiringInDays)),
      )
      .filter(
        (c) =>
          !filter.q ||
          c.memberName.toLowerCase().includes(filter.q.toLowerCase()),
      )
      .sort((a, b) => b.issuedOn.localeCompare(a.issuedOn) || b.id - a.id);
  }

  list(scope: TenantScope, filter: CardFilter, paging: PageParams) {
    const rows = this.filtered(scope, filter);
    const start = (paging.page - 1) * paging.pageSize;
    return Promise.resolve(
      buildPage(
        rows.slice(start, start + paging.pageSize),
        rows.length,
        paging,
      ),
    );
  }

  findById(scope: TenantScope, id: number) {
    return Promise.resolve(
      this.data.cards.find((c) => c.id === id && inScope(scope, c)) ?? null,
    );
  }

  findByMember(scope: TenantScope, memberId: number) {
    return Promise.resolve(
      this.data.cards.filter(
        (c) =>
          c.denominationId === scope.denominationId && c.memberId === memberId,
      ),
    );
  }

  listCandidates(
    scope: TenantScope,
    query: { q?: string; today: string },
    paging: PageParams,
  ): Promise<Page<CardCandidateRecord>> {
    const congregationId = scope.requireCongregationId();
    const rows = this.data.members
      .filter(
        (m) =>
          m.denominationId === scope.denominationId &&
          m.congregationId === congregationId &&
          m.status === 'ACTIVE' &&
          m.memberNumber !== null,
      )
      .filter(
        (m) =>
          !query.q || m.fullName.toLowerCase().includes(query.q.toLowerCase()),
      )
      .map((m) => ({
        member: m,
        cards: this.data.cards.filter(
          (c) => c.memberId === m.id && c.congregationId === congregationId,
        ),
      }))
      .filter(
        ({ cards }) =>
          !cards.some((c) => cardStatusOf(c, query.today) === 'VALID'),
      )
      .map(({ member, cards }) => ({
        memberId: member.id,
        fullName: member.fullName,
        cardNumber: member.code,
        hasExpiredCard: cards.some(
          (c) => cardStatusOf(c, query.today) === 'EXPIRED',
        ),
      }));
    const start = (paging.page - 1) * paging.pageSize;
    return Promise.resolve(
      buildPage(
        rows.slice(start, start + paging.pageSize),
        rows.length,
        paging,
      ),
    );
  }

  insert(scope: TenantScope, input: NewMembershipCard): Promise<CardRecord> {
    const congregationId = scope.requireCongregationId();
    const congregation = this.data.congregations.get(congregationId)!;
    const member = this.data.members.find((m) => m.id === input.memberId)!;
    const row: StoredCard = {
      id: this.data.nextId++,
      denominationId: scope.denominationId,
      memberId: input.memberId,
      memberName: member.fullName,
      congregationId,
      congregationCode: congregation.code,
      congregationName: congregation.name,
      denominationName: 'Iglesia Cristiana Monte de Sion',
      memberNumber: input.memberNumber,
      issuedOn: input.issuedOn,
      expiresOn: input.expiresOn,
      voidedAt: null,
      voidReason: null,
    };
    this.data.cards.push(row);
    this.transactions.undo.push(() => {
      this.data.cards = this.data.cards.filter((c) => c !== row);
    });
    return Promise.resolve(row);
  }

  markVoided(scope: TenantScope, id: number, reason: string, at: Date) {
    const row = this.data.cards.find(
      (c) => c.id === id && inScope(scope, c) && c.voidedAt === null,
    );
    if (!row) {
      return Promise.resolve(false);
    }
    row.voidedAt = at;
    row.voidReason = reason;
    return Promise.resolve(true);
  }

  counts(
    scope: TenantScope,
    today: string,
    expiringBefore: string,
  ): Promise<CardCounts> {
    const rows = this.data.cards.filter((c) => inScope(scope, c));
    const valid = rows.filter((c) => cardStatusOf(c, today) === 'VALID');
    return Promise.resolve({
      valid: valid.length,
      expiringSoon: valid.filter((c) => c.expiresOn <= expiringBefore).length,
      expired: rows.filter((c) => cardStatusOf(c, today) === 'EXPIRED').length,
    });
  }
}

class FakeMemberReader implements CertificateMemberReader {
  constructor(private readonly data: FakeData) {}

  findMember(scope: TenantScope, memberId: number) {
    return Promise.resolve(
      this.data.members.find((m) => m.id === memberId && inScope(scope, m)) ??
        null,
    );
  }
}

/** Stands for SearchPeople (purpose MEMBER_LOOKUP): active members of the sede, document masked. */
class FakeMemberSearch implements CertificateMemberSearch {
  constructor(private readonly data: FakeData) {}

  searchActiveMembers(scope: TenantScope, query: string, limit: number) {
    const text = query.toLowerCase();
    return Promise.resolve(
      this.data.members
        .filter((m) => inScope(scope, m) && m.status === 'ACTIVE')
        .filter(
          (m) =>
            m.fullName.toLowerCase().includes(text) ||
            m.code.toLowerCase() === text ||
            (m.documentNumber ?? '').includes(text),
        )
        .slice(0, limit)
        .map(toMemberOption),
    );
  }
}

class FakeContextReader implements CertificateContextReader {
  constructor(private readonly data: FakeData) {}

  findLetterhead(scope: TenantScope) {
    const id = scope.requireCongregationId();
    const congregation = this.data.congregations.get(id);
    return Promise.resolve(
      congregation?.denominationId === scope.denominationId
        ? (this.data.letterheads.get(id) ?? null)
        : null,
    );
  }

  findSigners(scope: TenantScope) {
    return Promise.resolve(
      this.data.signers.get(scope.requireCongregationId()) ?? {
        pastor: null,
        secretary: null,
      },
    );
  }

  findUserName() {
    return Promise.resolve('Marta Castillo');
  }
}

/** Id of the donations certificate type of denomination 1 (denomination 2 has the next one). */
export const DON_TYPE_ID = 9;
export const CENTRAL = { denominationId: 1, congregationId: 10 } as const;
export const NORTE = { denominationId: 1, congregationId: 11 } as const;
export const OTHER_DENOMINATION = {
  denominationId: 2,
  congregationId: 20,
} as const;

function member(
  id: number,
  place: { denominationId: number; congregationId: number },
  code: string,
  extra: Partial<StoredMember> = {},
): StoredMember {
  return {
    id,
    ...place,
    status: 'ACTIVE',
    fullName: `Miembro ${id}`,
    code,
    memberNumber: Number(code.split('-')[1]),
    documentTypeCode: 'CC',
    documentNumber: `5241891${id}`,
    joinedOn: '2008-04-10',
    isBaptized: true,
    waterBaptismOn: '2009-04-12',
    ...extra,
  };
}

function letterhead(name: string): Letterhead {
  return {
    denominationName: 'Iglesia Cristiana Monte de Sion',
    legalName: 'Iglesia Cristiana Monte de Sion',
    taxId: '900.123.456-7',
    congregationName: name,
    cityName: 'Bogotá, D.C.',
    locationLine: `${name} · Bogotá, D.C. · Distrito 1`,
  };
}

/**
 * A small world: two denominations; the first has Sede Central (10) and Sede Norte (11), each with
 * members, a pastor and the four certificate types. Dates are fixed at 2026-11-02 (Bogota).
 */
export function buildWorld() {
  const data = new FakeData();
  const clock = new FixedClock(new Date('2026-11-02T15:00:00.000Z'));
  const transactions = new FakeTransactionRunner();
  const sequences = new FakeSequenceStore(transactions);
  const audit = new RecordingAudit();
  const renderer = new FakePdfRenderer();

  data.congregations
    .set(10, { denominationId: 1, code: 'SC', name: 'Sede Central' })
    .set(11, { denominationId: 1, code: 'SN', name: 'Sede Norte' })
    .set(20, { denominationId: 2, code: 'OT', name: 'Sede Otra' });
  for (const [id, name] of [
    [10, 'Sede Central'],
    [11, 'Sede Norte'],
    [20, 'Sede Otra'],
  ] as const) {
    data.letterheads.set(id, letterhead(name));
    data.signers.set(id, {
      pastor: { personId: id * 10, name: `Pastor ${name}` },
      secretary: { personId: null, name: 'Marta Castillo' },
    });
  }

  let typeId = 1;
  for (const denominationId of [1, 2]) {
    for (const [code, name, validityDays] of [
      ['MEM', 'Certificado de membresía', null],
      ['TRA', 'Carta de traslado', 90],
      ['BAU', 'Certificado de bautismo', null],
      ['ASI', 'Constancia de asistencia', 30],
    ] as const) {
      data.types.push({
        id: typeId++,
        denominationId,
        code,
        name,
        template: null,
        introTemplate: null,
        closingTemplate: null,
        pastorTitleTemplate: null,
        secretaryTitleTemplate: null,
        validityDays,
      });
    }
  }

  // The donations certificate goes after the others, so the ids of the first four types of each
  // denomination stay as they were (type 5 is still the first one of denomination 2).
  for (const [id, denominationId] of [
    [DON_TYPE_ID, 1],
    [DON_TYPE_ID + 1, 2],
  ] as const) {
    data.types.push({
      id,
      denominationId,
      code: 'DON',
      name: 'Certificado de donaciones',
      template: null,
      introTemplate: null,
      closingTemplate: null,
      pastorTitleTemplate: null,
      secretaryTitleTemplate: null,
      validityDays: null,
    });
  }

  data.members.push(
    member(1, CENTRAL, 'SC-0130', { fullName: 'Ana María Rojas Díaz' }),
    member(2, CENTRAL, 'SC-0131', { isBaptized: false, waterBaptismOn: null }),
    member(3, CENTRAL, 'SC-0132', { status: 'INACTIVE' }),
    member(4, NORTE, 'SN-0005', { fullName: 'Luis Pérez' }),
    member(5, OTHER_DENOMINATION, 'OT-0001'),
    member(6, CENTRAL, 'SC-0133', { memberNumber: null, code: '' }),
  );

  const numbering = new DocumentNumberingService(sequences, transactions);
  const certificates = new FakeCertificateRepository(
    data,
    sequences,
    transactions,
  );
  const cards = new FakeCardRepository(data, transactions);
  const members = new FakeMemberReader(data);
  const context = new FakeContextReader(data);
  const drafts = new CertificateDraftService(
    certificates,
    members,
    context,
    new FakeDonationReader(data),
    new FakeBrandingReader(data),
  );
  const branding = new DocumentBrandingService(
    new FakeBrandingReader(data),
    new FakeStorage(data),
  );

  return {
    data,
    clock,
    audit,
    renderer,
    sequences,
    transactions,
    useCases: {
      issuingContext: new GetIssuingContextUseCase(
        certificates,
        context,
        clock,
      ),
      types: new ListCertificateTypesUseCase(certificates),
      preview: new PreviewCertificateUseCase(drafts, certificates, clock),
      issue: new IssueCertificateUseCase(
        drafts,
        certificates,
        numbering,
        transactions,
        audit,
        clock,
      ),
      list: new ListCertificatesUseCase(certificates),
      exportCsv: new ExportCertificatesUseCase(certificates),
      get: new GetCertificateUseCase(certificates),
      void: new VoidCertificateUseCase(
        certificates,
        transactions,
        audit,
        clock,
      ),
      summary: new GetCertificatesSummaryUseCase(certificates, cards, clock),
      pdf: new RenderCertificatePdfUseCase(
        certificates,
        renderer,
        new FakeVerificationLinks(),
        branding,
      ),
      listTemplates: new ListCertificateTypeTemplatesUseCase(certificates),
      updateType: new UpdateCertificateTypeUseCase(
        certificates,
        transactions,
        audit,
      ),
      previewTemplate: new PreviewCertificateTemplateUseCase(
        certificates,
        clock,
      ),
      verify: new VerifyCertificateUseCase(
        new FakeVerificationLinks(),
        new FakeVerificationReader(data),
        clock,
      ),
      searchMembers: new SearchCertificateMembersUseCase(
        new FakeMemberSearch(data),
      ),
      findMember: new FindCertificateMemberUseCase(members),
      listCards: new ListCardsUseCase(cards, clock),
      candidates: new ListCardCandidatesUseCase(cards, clock),
      issueCard: new IssueCardUseCase(
        cards,
        members,
        transactions,
        audit,
        clock,
      ),
      voidCard: new VoidCardUseCase(cards, transactions, audit, clock),
      cardPdf: new RenderCardPdfUseCase(cards, renderer, clock, branding),
    },
  };
}

export type World = ReturnType<typeof buildWorld>;

/** Tenant context of the secretary of a sede: the certificates.issue permission in a congregation scope. */
export function secretaryOf(
  place: { denominationId: number; congregationId: number },
  userId = 7,
) {
  return buildTenantContext({
    denominationId: place.denominationId,
    congregationId: place.congregationId,
    permissions: ['certificates.issue'],
    userId,
  });
}

/** A pastor holding the role for the whole denomination: reads every sede, cannot write. */
export function denominationWideReader(denominationId = 1) {
  return buildTenantContext({
    kind: 'DENOMINATION',
    denominationId,
    permissions: ['certificates.issue'],
  });
}

export function seedCard(
  world: World,
  place: { denominationId: number; congregationId: number },
  memberId: number,
  overrides: Partial<StoredCard> = {},
): StoredCard {
  const congregation = world.data.congregations.get(place.congregationId)!;
  const owner = world.data.members.find((m) => m.id === memberId)!;
  const card: StoredCard = {
    id: world.data.nextId++,
    denominationId: place.denominationId,
    memberId,
    memberName: owner.fullName,
    congregationId: place.congregationId,
    congregationCode: congregation.code,
    congregationName: congregation.name,
    denominationName: 'Iglesia Cristiana Monte de Sion',
    memberNumber: owner.memberNumber ?? 1,
    issuedOn: '2025-11-02',
    expiresOn: '2027-11-02',
    voidedAt: null,
    voidReason: null,
    ...overrides,
  };
  world.data.cards.push(card);
  return card;
}

export { formatMemberCode };
