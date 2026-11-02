import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { Permission } from '../../../../core/auth/permission';
import { DemoDatabase, formatMemberCode } from '../../../../core/demo/demo-database';
import { demoCommand } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AuditChange } from '../../../../core/models/identity.model';
import {
  DEMO_MUNICIPALITIES,
  DOCUMENT_TYPES,
  EDUCATION_LEVELS,
  MARITAL_STATUSES,
  STUDY_TYPES,
} from '../../../../core/models/catalogs';
import { Member, Person, ageOn, personFullName } from '../../../../core/models/membership.model';
import { matchesText, paginate } from '../../../../shared/utils/pagination';
import { MembersRepository } from './members.repository';
import { MembershipDemoStore } from './membership-demo-store';
import {
  AGE_RANGES,
  ChurchPosition,
  CongregationOption,
  ConsentView,
  FamilyRelationInput,
  FamilyRelationView,
  MemberDetail,
  MemberFilters,
  MemberListItem,
  MemberListPage,
  MemberListQuery,
  MemberPositionsView,
  MemberRegistryView,
  PersonOption,
  PersonStudy,
  PersonStudyInput,
  PersonUpdate,
  PositionAssignmentInput,
  SISBEN_LEVELS,
  SocioeconomicProfile,
  SocioeconomicProfileInput,
  StatusCounts,
  TransferInput,
  TransferResult,
  todayIso,
} from './members.models';

const NOT_FOUND_MESSAGE = 'No encontramos el miembro en la sede o denominación en la que actúas.';
const RELATIVE_SEARCH_LIMIT = 8;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DOCUMENT_NUMBER = /^[A-Za-z0-9-]{3,30}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface MemberContext {
  readonly member: Member;
  readonly person: Person;
}

/**
 * Demo adapter of the members module. It simulates the API: tenant isolation by denomination and
 * sede, defensive permission checks, the business rules and the audit trail (without personal data).
 */
@Injectable()
export class DemoMembersRepository extends MembersRepository {
  private readonly db = inject(DemoDatabase);
  private readonly store = inject(MembershipDemoStore);
  private readonly auth = inject(AuthService);

  // ---------- List ----------

  list(query: MemberListQuery): Observable<MemberListPage> {
    return demoCommand(() => {
      this.require('members.read', 'consultar miembros');
      const scoped = this.filterRows(this.visibleRows(), { ...query, status: 'ALL' });
      const statusCounts: StatusCounts = {
        ALL: scoped.length,
        ACTIVE: scoped.filter((row) => row.status === 'ACTIVE').length,
        INACTIVE: scoped.filter((row) => row.status === 'INACTIVE').length,
        TRANSFERRED: scoped.filter((row) => row.status === 'TRANSFERRED').length,
        DECEASED: scoped.filter((row) => row.status === 'DECEASED').length,
      };
      const rows =
        query.status === 'ALL' ? scoped : scoped.filter((row) => row.status === query.status);
      return { ...paginate(rows, query), statusCounts };
    });
  }

  exportRows(filters: MemberFilters): Observable<MemberListItem[]> {
    return demoCommand(() => {
      this.require('members.read', 'consultar miembros');
      this.require('members.write', 'exportar el listado de miembros');
      const rows = this.filterRows(this.visibleRows(), filters);
      const tenant = this.tenant();
      this.db.audit({
        userId: this.userId(),
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        entity: 'Member',
        entityId: '*',
        action: 'MEMBERS_EXPORTED',
        changes: { rows: { from: null, to: rows.length } },
      });
      return rows;
    });
  }

  positionCatalog(): Observable<ChurchPosition[]> {
    return demoCommand(() => {
      this.require('members.read', 'consultar miembros');
      return this.positionsOfDenomination();
    });
  }

  // ---------- Personal data ----------

  detail(memberId: number): Observable<MemberDetail> {
    return demoCommand(() => this.toDetail(this.readMember(memberId)));
  }

  updatePerson(memberId: number, input: PersonUpdate): Observable<MemberDetail> {
    return demoCommand(() => {
      const context = this.writeMember(memberId, 'members.write', 'editar miembros');
      const person = normalizePerson(input);
      validatePerson(person);
      this.ensureUniqueDocument(context.person, person);

      const changedFields = (Object.keys(person) as (keyof PersonUpdate)[]).filter(
        (key) => person[key] !== context.person[key],
      );
      this.db.replace(this.db.persons, { ...context.person, ...person });
      this.audit(context.member, 'Person', context.person.id, 'UPDATE', {
        updatedFields: { from: null, to: changedFields.length },
      });
      return this.toDetail(this.readMember(memberId));
    });
  }

  // ---------- Family ----------

  family(memberId: number): Observable<FamilyRelationView[]> {
    return demoCommand(() => {
      const { person } = this.readMember(memberId);
      return this.store.familyRelations
        .filter(
          (relation) =>
            relation.personId === person.id && relation.denominationId === person.denominationId,
        )
        .flatMap((relation) => {
          const relative = this.db.person(relation.relativeId);
          return relative && relative.denominationId === person.denominationId
            ? [this.toRelativeView(relation.id, relation.type, relative)]
            : [];
        });
    });
  }

  searchRelatives(memberId: number, text: string): Observable<PersonOption[]> {
    return demoCommand(() => {
      const { person } = this.readMember(memberId);
      if (text.trim().length < 2) {
        return [];
      }
      return this.db.persons
        .filter(
          (candidate) =>
            candidate.denominationId === person.denominationId &&
            candidate.id !== person.id &&
            matchesText([personFullName(candidate), candidate.documentNumber], text),
        )
        .sort((a, b) => personFullName(a).localeCompare(personFullName(b), 'es'))
        .slice(0, RELATIVE_SEARCH_LIMIT)
        .map((candidate) => {
          const member = this.db.members.find((row) => row.personId === candidate.id);
          return {
            id: candidate.id,
            fullName: personFullName(candidate),
            documentTypeCode: candidate.documentTypeCode,
            documentNumber: candidate.documentNumber,
            congregationName: member
              ? (this.db.congregation(member.congregationId)?.name ?? null)
              : null,
          };
        });
    });
  }

  addFamilyRelation(memberId: number, input: FamilyRelationInput): Observable<void> {
    return demoCommand(() => {
      const { member, person } = this.writeMember(memberId, 'members.write', 'editar la familia');
      const relative = this.db.person(input.relativeId);
      if (!relative || relative.denominationId !== person.denominationId) {
        throw new DomainError('NOT_FOUND', 'La persona seleccionada no existe en la denominación.');
      }
      if (relative.id === person.id) {
        throw new DomainError('INVALID_RELATION', 'Una persona no puede ser su propio familiar.');
      }
      const relations = this.store.familyRelations.filter(
        (relation) => relation.personId === person.id,
      );
      if (relations.some((relation) => relation.relativeId === relative.id)) {
        throw new DomainError(
          'DUPLICATE_RELATION',
          'Esta persona ya está registrada como familiar.',
        );
      }
      if (
        (input.type === 'FATHER' || input.type === 'MOTHER') &&
        relations.some((r) => r.type === input.type)
      ) {
        throw new DomainError(
          'PARENT_ALREADY_SET',
          input.type === 'FATHER' ? 'Ya hay un padre registrado.' : 'Ya hay una madre registrada.',
        );
      }
      const id = this.db.nextId(this.store.familyRelations);
      this.store.familyRelations.push({
        id,
        denominationId: person.denominationId,
        personId: person.id,
        relativeId: relative.id,
        type: input.type,
      });
      this.audit(member, 'FamilyRelation', id, 'CREATE', { type: { from: null, to: input.type } });
    });
  }

  removeFamilyRelation(memberId: number, relationId: number): Observable<void> {
    return demoCommand(() => {
      const { member, person } = this.writeMember(memberId, 'members.write', 'editar la familia');
      const index = this.store.familyRelations.findIndex(
        (relation) => relation.id === relationId && relation.personId === person.id,
      );
      if (index === -1) {
        throw new DomainError('NOT_FOUND', 'El parentesco ya no existe.');
      }
      const [removed] = this.store.familyRelations.splice(index, 1);
      this.audit(member, 'FamilyRelation', relationId, 'DELETE', {
        type: { from: removed.type, to: null },
      });
    });
  }

  // ---------- Studies ----------

  studies(memberId: number): Observable<PersonStudy[]> {
    return demoCommand(() => {
      const { person } = this.readMember(memberId);
      return this.store.personStudies
        .filter(
          (study) => study.personId === person.id && study.denominationId === person.denominationId,
        )
        .sort((a, b) => (b.year ?? 0) - (a.year ?? 0));
    });
  }

  addStudy(memberId: number, input: PersonStudyInput): Observable<void> {
    return demoCommand(() => {
      const { member, person } = this.writeMember(memberId, 'members.write', 'registrar estudios');
      const study = validateStudy(input);
      const id = this.db.nextId(this.store.personStudies);
      this.store.personStudies.push({
        ...study,
        id,
        denominationId: person.denominationId,
        personId: person.id,
      });
      this.audit(member, 'PersonStudy', id, 'CREATE', { status: { from: null, to: study.status } });
    });
  }

  removeStudy(memberId: number, studyId: number): Observable<void> {
    return demoCommand(() => {
      const { member, person } = this.writeMember(memberId, 'members.write', 'registrar estudios');
      const index = this.store.personStudies.findIndex(
        (study) => study.id === studyId && study.personId === person.id,
      );
      if (index === -1) {
        throw new DomainError('NOT_FOUND', 'El estudio ya no existe.');
      }
      this.store.personStudies.splice(index, 1);
      this.audit(member, 'PersonStudy', studyId, 'DELETE', null);
    });
  }

  // ---------- Positions and pastoral rank ----------

  positions(memberId: number): Observable<MemberPositionsView> {
    return demoCommand(() => {
      const { member } = this.readMember(memberId);
      const catalog = this.positionsOfDenomination(member.denominationId);
      const rankCatalog = this.store.pastoralRanks.filter(
        (rank) => rank.denominationId === member.denominationId,
      );
      const pastoralRankId = this.store.pastoralRankOf(member.id);
      return {
        pastoralRankId,
        pastoralRankName: rankCatalog.find((rank) => rank.id === pastoralRankId)?.name ?? null,
        positions: this.store.memberPositions
          .filter(
            (row) => row.memberId === member.id && row.denominationId === member.denominationId,
          )
          .sort((a, b) => (b.startedOn ?? '').localeCompare(a.startedOn ?? ''))
          .map((row) => ({
            ...row,
            positionName: catalog.find((position) => position.id === row.positionId)?.name ?? '—',
          })),
        positionCatalog: catalog,
        rankCatalog,
      };
    });
  }

  assignPosition(memberId: number, input: PositionAssignmentInput): Observable<void> {
    return demoCommand(() => {
      const { member } = this.writeMember(memberId, 'members.write', 'asignar cargos');
      if (member.status !== 'ACTIVE') {
        throw new DomainError(
          'MEMBER_NOT_ACTIVE',
          'Solo los miembros activos pueden ocupar cargos.',
        );
      }
      const position = this.store.churchPositions.find(
        (row) =>
          row.id === input.positionId &&
          row.denominationId === member.denominationId &&
          row.isActive,
      );
      if (!position) {
        throw new DomainError('NOT_FOUND', 'El cargo no existe o está inactivo.');
      }
      requirePastDate(input.startedOn, 'La fecha de inicio no es válida.');
      const isOpen = this.store.memberPositions.some(
        (row) =>
          row.memberId === member.id && row.positionId === position.id && row.endedOn === null,
      );
      if (isOpen) {
        throw new DomainError('DUPLICATE_POSITION', 'El miembro ya ocupa ese cargo.');
      }
      const id = this.db.nextId(this.store.memberPositions);
      this.store.memberPositions.push({
        id,
        denominationId: member.denominationId,
        memberId: member.id,
        positionId: position.id,
        startedOn: input.startedOn,
        endedOn: null,
      });
      this.audit(member, 'MemberPosition', id, 'CREATE', {
        positionId: { from: null, to: position.id },
      });
    });
  }

  closePosition(memberId: number, memberPositionId: number, endedOn: string): Observable<void> {
    return demoCommand(() => {
      const { member } = this.writeMember(memberId, 'members.write', 'cerrar cargos');
      const row = this.store.memberPositions.find(
        (item) => item.id === memberPositionId && item.memberId === member.id,
      );
      if (!row) {
        throw new DomainError('NOT_FOUND', 'El cargo ya no existe.');
      }
      if (row.endedOn !== null) {
        throw new DomainError('POSITION_ALREADY_CLOSED', 'El cargo ya estaba cerrado.');
      }
      requirePastDate(endedOn, 'La fecha de cierre no es válida.');
      if (row.startedOn && endedOn < row.startedOn) {
        throw new DomainError(
          'INVALID_DATE',
          'La fecha de cierre no puede ser anterior al inicio del cargo.',
        );
      }
      this.db.replace(this.store.memberPositions, { ...row, endedOn });
      this.audit(member, 'MemberPosition', row.id, 'UPDATE', {
        endedOn: { from: null, to: endedOn },
      });
    });
  }

  setPastoralRank(memberId: number, pastoralRankId: number | null): Observable<void> {
    return demoCommand(() => {
      const { member } = this.writeMember(memberId, 'members.write', 'asignar grados');
      if (pastoralRankId !== null) {
        const rank = this.store.pastoralRanks.find(
          (row) =>
            row.id === pastoralRankId &&
            row.denominationId === member.denominationId &&
            row.isActive,
        );
        if (!rank) {
          throw new DomainError('NOT_FOUND', 'El grado pastoral no existe o está inactivo.');
        }
      }
      const previous = this.store.pastoralRankOf(member.id);
      this.store.setPastoralRank(member.id, pastoralRankId);
      this.audit(member, 'Member', member.id, 'UPDATE', {
        pastoralRankId: { from: previous, to: pastoralRankId },
      });
    });
  }

  // ---------- Socioeconomic profile ----------

  socioeconomicProfile(memberId: number): Observable<SocioeconomicProfile | null> {
    return demoCommand(() => {
      const { member, person } = this.readMember(memberId);
      this.require('socioeconomic-profiles.read', 'consultar la ficha socioeconómica');
      this.audit(member, 'SocioeconomicProfile', person.id, 'SOCIOECONOMIC_PROFILE_VIEWED', null);
      return (
        this.store.socioeconomicProfiles.find(
          (profile) =>
            profile.personId === person.id && profile.denominationId === person.denominationId,
        ) ?? null
      );
    });
  }

  saveSocioeconomicProfile(
    memberId: number,
    input: SocioeconomicProfileInput,
  ): Observable<SocioeconomicProfile> {
    return demoCommand(() => {
      const { member, person } = this.writeMember(
        memberId,
        'socioeconomic-profiles.write',
        'editar la ficha socioeconómica',
      );
      if (
        input.sisbenLevel !== null &&
        !(SISBEN_LEVELS as readonly number[]).includes(input.sisbenLevel)
      ) {
        throw new DomainError('VALIDATION', 'El nivel del SISBÉN debe estar entre 1 y 6.');
      }
      const profile: SocioeconomicProfile = {
        ...input,
        personId: person.id,
        denominationId: person.denominationId,
        updatedAt: new Date().toISOString(),
      };
      this.store.saveSocioeconomicProfile(profile);
      // The values are sensitive: the audit records the change, never the answers.
      this.audit(member, 'SocioeconomicProfile', person.id, 'UPDATE', null);
      return profile;
    });
  }

  // ---------- Registry and transfers ----------

  registry(memberId: number): Observable<MemberRegistryView> {
    return demoCommand(() => {
      const { member } = this.readMember(memberId);
      const name = (congregationId: number | null): string =>
        congregationId === null ? '—' : (this.db.congregation(congregationId)?.name ?? '—');
      return {
        entries: this.db.memberRegistryEntries
          .filter(
            (entry) =>
              entry.memberId === member.id && entry.denominationId === member.denominationId,
          )
          .sort((a, b) => b.startedOn.localeCompare(a.startedOn))
          .map((entry) => ({
            id: entry.id,
            congregationId: entry.congregationId,
            congregationName: name(entry.congregationId),
            memberNumber: entry.memberNumber,
            code: formatMemberCode(name(entry.congregationId), entry.memberNumber),
            registryBook: entry.registryBook,
            registryFolio: entry.registryFolio,
            startedOn: entry.startedOn,
            endedOn: entry.endedOn,
          })),
        transfers: this.store.memberTransfers
          .filter(
            (transfer) =>
              transfer.memberId === member.id && transfer.denominationId === member.denominationId,
          )
          .sort((a, b) => b.transferDate.localeCompare(a.transferDate))
          .map((transfer) => ({
            id: transfer.id,
            originName: name(transfer.originCongregationId),
            destinationName:
              transfer.externalDestinationName ?? name(transfer.destinationCongregationId),
            isExternal: transfer.destinationCongregationId === null,
            status: transfer.status,
            transferDate: transfer.transferDate,
            notes: transfer.notes,
          })),
      };
    });
  }

  transferDestinations(memberId: number): Observable<CongregationOption[]> {
    return demoCommand(() => {
      const { member } = this.readMember(memberId);
      return this.db.congregations
        .filter(
          (c) =>
            c.denominationId === member.denominationId &&
            c.isActive &&
            c.id !== member.congregationId,
        )
        .map((c) => ({ id: c.id, name: c.name, municipalityCode: c.municipalityCode }));
    });
  }

  transfer(memberId: number, input: TransferInput): Observable<TransferResult> {
    return demoCommand(() => {
      const { member } = this.writeMember(memberId, 'members.write', 'trasladar miembros');
      if (member.status !== 'ACTIVE') {
        throw new DomainError('MEMBER_NOT_ACTIVE', 'Solo se puede trasladar a un miembro activo.');
      }
      const reason = input.reason.trim();
      if (reason === '' || reason.length > 255) {
        throw new DomainError(
          'VALIDATION',
          'Indica el motivo del traslado (máximo 255 caracteres).',
        );
      }
      requirePastDate(input.transferDate, 'La fecha del traslado no es válida o es futura.');
      const current = this.db.currentRegistryEntry(member.id);
      if (current && input.transferDate < current.startedOn) {
        throw new DomainError(
          'INVALID_DATE',
          'La fecha del traslado es anterior al registro vigente en la sede.',
        );
      }
      return input.kind === 'INTERNAL'
        ? this.transferInternally(
            member,
            input.destinationCongregationId,
            input.transferDate,
            reason,
          )
        : this.transferExternally(
            member,
            input.externalDestinationName,
            input.transferDate,
            reason,
          );
    });
  }

  // ---------- Consents ----------

  consents(memberId: number): Observable<ConsentView[]> {
    return demoCommand(() => {
      const { person } = this.readMember(memberId);
      return this.db.dataConsents
        .filter(
          (consent) =>
            consent.personId === person.id && consent.denominationId === person.denominationId,
        )
        .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt))
        .map((consent) => {
          const policy = this.db.privacyPolicies.find((row) => row.id === consent.policyId);
          const guardian =
            consent.guardianId === null ? undefined : this.db.person(consent.guardianId);
          return {
            id: consent.id,
            policyVersion: policy?.version ?? '—',
            policyEffectiveFrom: policy?.effectiveFrom ?? null,
            channel: consent.channel,
            grantedAt: consent.grantedAt,
            revokedAt: consent.revokedAt,
            guardianName: guardian ? personFullName(guardian) : null,
          };
        });
    });
  }

  revokeConsent(memberId: number, consentId: number): Observable<void> {
    return demoCommand(() => {
      const { member, person } = this.writeMember(
        memberId,
        'members.write',
        'registrar revocaciones',
      );
      const consent = this.db.dataConsents.find(
        (row) => row.id === consentId && row.personId === person.id,
      );
      if (!consent) {
        throw new DomainError('NOT_FOUND', 'La autorización no existe.');
      }
      if (consent.revokedAt !== null) {
        throw new DomainError('ALREADY_REVOKED', 'La autorización ya estaba revocada.');
      }
      const revokedAt = new Date().toISOString();
      this.db.replace(this.db.dataConsents, { ...consent, revokedAt });
      // The anonymization itself is an API process (C-07); the demo only records it as pending.
      this.audit(member, 'DataConsent', consent.id, 'CONSENT_REVOKED', {
        revokedAt: { from: null, to: revokedAt.slice(0, 10) },
        anonymizationPending: { from: false, to: true },
      });
    });
  }

  // ---------- Transfers (private) ----------

  private transferInternally(
    member: Member,
    destinationId: number,
    date: string,
    reason: string,
  ): TransferResult {
    const destination = this.db.congregation(destinationId);
    if (
      !destination ||
      destination.denominationId !== member.denominationId ||
      !destination.isActive
    ) {
      throw new DomainError('INVALID_DESTINATION', 'La sede destino no existe o está inactiva.');
    }
    if (destination.id === member.congregationId) {
      throw new DomainError('SAME_CONGREGATION', 'El miembro ya pertenece a esa sede.');
    }
    this.closeCurrentEntry(member.id, date);
    const memberNumber =
      this.db.memberRegistryEntries
        .filter((entry) => entry.congregationId === destination.id)
        .reduce((max, entry) => Math.max(max, entry.memberNumber), 0) + 1;
    this.db.memberRegistryEntries.push({
      id: this.db.nextId(this.db.memberRegistryEntries),
      denominationId: member.denominationId,
      memberId: member.id,
      congregationId: destination.id,
      memberNumber,
      registryBook: String(1 + Math.floor(memberNumber / 100)),
      registryFolio: String((memberNumber % 100) + 1),
      startedOn: date,
      endedOn: null,
    });
    this.db.replace(this.db.members, { ...member, congregationId: destination.id });
    const transferId = this.recordTransfer(member, destination.id, null, date, reason);
    this.audit(member, 'MemberTransfer', transferId, 'MEMBER_TRANSFERRED', {
      congregationId: { from: member.congregationId, to: destination.id },
      memberNumber: { from: null, to: memberNumber },
    });
    const tenant = this.tenant();
    return {
      kind: 'INTERNAL',
      destinationName: destination.name,
      stillVisible: tenant.congregationId === null,
    };
  }

  private transferExternally(
    member: Member,
    churchName: string,
    date: string,
    reason: string,
  ): TransferResult {
    const name = churchName.trim();
    if (name.length < 3 || name.length > 150) {
      throw new DomainError(
        'VALIDATION',
        'Escribe el nombre de la iglesia destino (entre 3 y 150 caracteres).',
      );
    }
    this.closeCurrentEntry(member.id, date);
    this.closeOpenPositions(member, date);
    this.db.replace(this.db.members, { ...member, status: 'TRANSFERRED' });
    const transferId = this.recordTransfer(member, null, name, date, reason);
    this.audit(member, 'MemberTransfer', transferId, 'MEMBER_TRANSFERRED', {
      status: { from: member.status, to: 'TRANSFERRED' },
    });
    return { kind: 'EXTERNAL', destinationName: name, stillVisible: true };
  }

  /**
   * Only active members hold church positions: leaving ACTIVE closes every open position on the
   * same date (never before the position started).
   */
  private closeOpenPositions(member: Member, date: string): void {
    const open = this.store.memberPositions.filter(
      (row) =>
        row.memberId === member.id &&
        row.denominationId === member.denominationId &&
        row.endedOn === null,
    );
    for (const row of open) {
      const endedOn = row.startedOn !== null && row.startedOn > date ? row.startedOn : date;
      this.db.replace(this.store.memberPositions, { ...row, endedOn });
      this.audit(member, 'MemberPosition', row.id, 'UPDATE', {
        endedOn: { from: null, to: endedOn },
      });
    }
  }

  private closeCurrentEntry(memberId: number, endedOn: string): void {
    const current = this.db.currentRegistryEntry(memberId);
    if (current) {
      this.db.replace(this.db.memberRegistryEntries, { ...current, endedOn });
    }
  }

  private recordTransfer(
    member: Member,
    destinationCongregationId: number | null,
    externalDestinationName: string | null,
    transferDate: string,
    notes: string,
  ): number {
    const id = this.db.nextId(this.store.memberTransfers);
    const now = new Date().toISOString();
    this.store.memberTransfers.push({
      id,
      denominationId: member.denominationId,
      memberId: member.id,
      originCongregationId: member.congregationId,
      destinationCongregationId,
      externalDestinationName,
      status: 'COMPLETED',
      transferDate,
      approvedById: this.userId(),
      approvedAt: now,
      notes,
      createdAt: now,
    });
    return id;
  }

  // ---------- Tenant, permissions and mapping ----------

  private tenant(): { denominationId: number; congregationId: number | null } {
    const { denominationId, congregationId } = this.auth.tenant();
    if (denominationId === null) {
      throw new DomainError(
        'FORBIDDEN',
        'Selecciona una denominación o sede para consultar miembros.',
      );
    }
    return { denominationId, congregationId };
  }

  private userId(): number | null {
    return this.auth.user()?.id ?? null;
  }

  private require(permission: Permission, action: string): void {
    if (!this.auth.can(permission)) {
      throw new DomainError('FORBIDDEN', `No tienes permiso para ${action}.`);
    }
  }

  private isVisible(member: Member): boolean {
    const tenant = this.tenant();
    return (
      member.denominationId === tenant.denominationId &&
      (tenant.congregationId === null || member.congregationId === tenant.congregationId)
    );
  }

  private readMember(memberId: number): MemberContext {
    this.require('members.read', 'consultar miembros');
    const member = this.db.members.find((row) => row.id === memberId);
    const person = member ? this.db.person(member.personId) : undefined;
    if (!member || !person || !this.isVisible(member)) {
      throw new DomainError('NOT_FOUND', NOT_FOUND_MESSAGE);
    }
    return { member, person };
  }

  private writeMember(memberId: number, permission: Permission, action: string): MemberContext {
    const context = this.readMember(memberId);
    this.require(permission, action);
    return context;
  }

  private visibleRows(): MemberListItem[] {
    const today = todayIso();
    return this.db.members
      .filter((member) => this.isVisible(member))
      .flatMap((member) => {
        const person = this.db.person(member.personId);
        return person ? [this.toListItem(member, person, today)] : [];
      })
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
  }

  private filterRows(rows: readonly MemberListItem[], filters: MemberFilters): MemberListItem[] {
    const ageRange = AGE_RANGES.find((range) => range.value === filters.ageRange) ?? AGE_RANGES[0];
    const position = filters.position;
    const positionName =
      typeof position === 'number'
        ? this.store.churchPositions.find((row) => row.id === position)?.name
        : undefined;
    return rows.filter(
      (row) =>
        matchesText([row.fullName, row.documentNumber, row.code], filters.text) &&
        (filters.status === 'ALL' || row.status === filters.status) &&
        (filters.sex === 'ALL' || row.sex === filters.sex) &&
        (ageRange.value === 'ALL' ||
          (row.age !== null && row.age >= ageRange.min && row.age <= ageRange.max)) &&
        (position === 'ALL' ||
          (position === 'NONE'
            ? row.positions.length === 0
            : positionName !== undefined && row.positions.includes(positionName))),
    );
  }

  private toListItem(member: Member, person: Person, today: string): MemberListItem {
    return {
      id: member.id,
      code: this.db.memberCode(member.id),
      fullName: personFullName(person),
      sex: person.sex,
      documentTypeCode: person.documentTypeCode,
      documentNumber: person.documentNumber,
      age: ageOn(person.birthDate, today),
      phone: person.phone,
      joinedOn: member.joinedOn,
      status: member.status,
      congregationId: member.congregationId,
      congregationName: this.db.congregation(member.congregationId)?.name ?? '—',
      positions: this.store.openPositionNames(member.id),
    };
  }

  private toDetail({ member, person }: MemberContext): MemberDetail {
    const congregation = this.db.congregation(member.congregationId);
    return {
      id: member.id,
      code: this.db.memberCode(member.id),
      status: member.status,
      joinedOn: member.joinedOn,
      isBaptized: member.isBaptized,
      waterBaptismOn: member.waterBaptismOn,
      previousCongregationName: member.previousCongregationName,
      congregationId: member.congregationId,
      congregationName: congregation?.name ?? '—',
      congregationMunicipalityCode: congregation?.municipalityCode ?? null,
      person,
    };
  }

  private toRelativeView(
    id: number,
    type: FamilyRelationView['type'],
    relative: Person,
  ): FamilyRelationView {
    const member = this.db.members.find((row) => row.personId === relative.id);
    return {
      id,
      type,
      relativeId: relative.id,
      fullName: personFullName(relative),
      documentTypeCode: relative.documentTypeCode,
      documentNumber: relative.documentNumber,
      age: ageOn(relative.birthDate, todayIso()),
      memberId: member && this.isVisible(member) ? member.id : null,
      memberCode: member ? this.db.memberCode(member.id) : null,
      congregationName: member ? (this.db.congregation(member.congregationId)?.name ?? null) : null,
      memberStatus: member?.status ?? null,
    };
  }

  private positionsOfDenomination(denominationId = this.tenant().denominationId): ChurchPosition[] {
    return this.store.churchPositions
      .filter((position) => position.denominationId === denominationId)
      .sort((a, b) => a.name.localeCompare(b.name, 'es'));
  }

  private ensureUniqueDocument(current: Person, update: PersonUpdate): void {
    if (update.documentNumber === null) {
      return;
    }
    const duplicate = this.db.persons.some(
      (person) =>
        person.id !== current.id &&
        person.denominationId === current.denominationId &&
        person.documentTypeCode === update.documentTypeCode &&
        person.documentNumber?.toUpperCase() === update.documentNumber?.toUpperCase(),
    );
    if (duplicate) {
      throw new DomainError(
        'DUPLICATE_DOCUMENT',
        'Ya existe otra persona con ese documento en la denominación.',
      );
    }
  }

  private audit(
    member: Member,
    entity: string,
    entityId: number,
    action: string,
    changes: Record<string, AuditChange> | null,
  ): void {
    this.db.audit({
      userId: this.userId(),
      denominationId: member.denominationId,
      congregationId: member.congregationId,
      entity,
      entityId: String(entityId),
      action,
      changes,
    });
  }
}

// ---------- Validation helpers ----------

function emptyToNull(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function normalizePerson(input: PersonUpdate): PersonUpdate {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    secondLastName: emptyToNull(input.secondLastName),
    documentTypeCode: emptyToNull(input.documentTypeCode),
    documentNumber: emptyToNull(input.documentNumber),
    birthDate: emptyToNull(input.birthDate),
    sex: input.sex,
    maritalStatusCode: emptyToNull(input.maritalStatusCode),
    educationLevelCode: emptyToNull(input.educationLevelCode),
    occupation: emptyToNull(input.occupation),
    phone: emptyToNull(input.phone),
    email: emptyToNull(input.email)?.toLowerCase() ?? null,
    address: emptyToNull(input.address),
    municipalityCode: emptyToNull(input.municipalityCode),
  };
}

function validatePerson(person: PersonUpdate): void {
  const invalid = (message: string): never => {
    throw new DomainError('VALIDATION', message);
  };
  if (person.firstName === '' || person.firstName.length > 100)
    invalid('Escribe los nombres (máximo 100 caracteres).');
  if (person.lastName === '' || person.lastName.length > 80)
    invalid('Escribe el primer apellido (máximo 80 caracteres).');
  if ((person.documentTypeCode === null) !== (person.documentNumber === null)) {
    invalid('El tipo y el número de documento van juntos.');
  }
  if (
    person.documentTypeCode !== null &&
    !DOCUMENT_TYPES.some((type) => type.code === person.documentTypeCode)
  ) {
    invalid('El tipo de documento no es válido.');
  }
  if (person.documentNumber !== null && !DOCUMENT_NUMBER.test(person.documentNumber)) {
    invalid('El número de documento solo admite letras, números y guiones (3 a 30).');
  }
  if (
    person.birthDate !== null &&
    (!ISO_DATE.test(person.birthDate) || person.birthDate > todayIso())
  ) {
    invalid('La fecha de nacimiento no es válida.');
  }
  if (person.sex !== null && person.sex !== 'FEMALE' && person.sex !== 'MALE')
    invalid('El sexo no es válido.');
  if (
    person.maritalStatusCode !== null &&
    !MARITAL_STATUSES.some((s) => s.code === person.maritalStatusCode)
  ) {
    invalid('El estado civil no es válido.');
  }
  if (
    person.educationLevelCode !== null &&
    !EDUCATION_LEVELS.some((l) => l.code === person.educationLevelCode)
  ) {
    invalid('El nivel educativo no es válido.');
  }
  if (person.email !== null && !EMAIL.test(person.email))
    invalid('El correo electrónico no es válido.');
  if (
    person.municipalityCode !== null &&
    !DEMO_MUNICIPALITIES.some((m) => m.code === person.municipalityCode)
  ) {
    invalid('El municipio no es válido.');
  }
}

function validateStudy(input: PersonStudyInput): PersonStudyInput {
  const name = input.name.trim();
  const institution = emptyToNull(input.institution);
  const currentYear = Number(todayIso().slice(0, 4));
  if (!STUDY_TYPES.some((type) => type.code === input.studyTypeCode)) {
    throw new DomainError('VALIDATION', 'El tipo de estudio no es válido.');
  }
  if (name.length < 3 || name.length > 150) {
    throw new DomainError('VALIDATION', 'Escribe el programa o título (entre 3 y 150 caracteres).');
  }
  if (institution !== null && institution.length > 150) {
    throw new DomainError('VALIDATION', 'La institución admite máximo 150 caracteres.');
  }
  if (
    input.year !== null &&
    (!Number.isInteger(input.year) || input.year < 1940 || input.year > currentYear)
  ) {
    throw new DomainError('VALIDATION', `El año debe estar entre 1940 y ${currentYear}.`);
  }
  if (input.status === 'COMPLETED' && input.year === null) {
    throw new DomainError('VALIDATION', 'Indica el año en que finalizó el estudio.');
  }
  return {
    studyTypeCode: input.studyTypeCode,
    name,
    institution,
    status: input.status,
    year: input.year,
  };
}

function requirePastDate(value: string, message: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value)) || value > todayIso()) {
    throw new DomainError('INVALID_DATE', message);
  }
}
