import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { Person, ageOn, personFullName } from '../../../../core/models/membership.model';
import { Congregation } from '../../../../core/models/organization.model';
import {
  ChildDedicationRow,
  MarriageRow,
  PastoralTermRow,
  RecordsDemoStore,
} from './records-demo-store';
import {
  ADULT_AGE,
  ChildDedication,
  ChildDedicationInput,
  MARRIAGE_END_REASONS,
  MARRIAGE_REGISTRIES,
  Marriage,
  MarriageDissolutionInput,
  MarriageInput,
  ParentInput,
  ParentReference,
  PastoralTerm,
  PastoralTermInput,
  PersonSummary,
  RecordsContext,
  previousDay,
  todayIso,
} from './records.models';
import { RecordsRepository } from './records.repository';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OPEN_END = '9999-12-31';
const MAX_NAME_LENGTH = 120;
const MAX_PLACE_LENGTH = 150;

/** Simulates the secretariat records endpoints over the in-memory store, scoped by tenant. */
@Injectable()
export class DemoRecordsRepository extends RecordsRepository {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DemoDatabase);
  private readonly store = inject(RecordsDemoStore);

  context(): Observable<RecordsContext> {
    const people = this.scopedPeople()
      .map((person) => this.summary(person))
      .sort((a, b) => a.fullName.localeCompare(b.fullName, 'es'));
    const congregations = this.scopedCongregations().map(({ id, name }) => ({ id, name }));
    return demoResponse({ congregations, people });
  }

  dedications(): Observable<ChildDedication[]> {
    const rows = this.store.dedications
      .filter((row) => this.inScope(row))
      .sort((a, b) => b.dedicatedOn.localeCompare(a.dedicatedOn));
    return demoResponse(rows.map((row) => this.toDedication(row)));
  }

  createDedication(input: ChildDedicationInput): Observable<ChildDedication> {
    return demoCommand(() => {
      this.assertCanWrite();
      const congregation = this.assertCongregation(input.congregationId);
      const child = this.assertPersonInScope(input.childId);
      const childMember = this.db.members.find((member) => member.personId === child.id);
      if (childMember && childMember.congregationId !== congregation.id) {
        throw new DomainError(
          'OUT_OF_SCOPE',
          'El niño o la niña es miembro de otra sede: la presentación se registra en su sede.',
        );
      }
      if (input.pastorId !== null) {
        this.assertPerson(input.pastorId);
      }
      assertPastDate(input.dedicatedOn, 'de la presentación');
      if (child.birthDate && input.dedicatedOn < child.birthDate) {
        throw new DomainError('INVALID_DATE', 'La presentación no puede ser anterior al nacimiento.');
      }
      const father = this.parent(input.father, child.id);
      const mother = this.parent(input.mother, child.id);
      if (!father && !mother) {
        throw new DomainError('PARENT_REQUIRED', 'Registra al menos al padre, la madre o un acudiente.');
      }

      const row: ChildDedicationRow = {
        id: this.store.nextId(this.store.dedications),
        denominationId: congregation.denominationId,
        congregationId: congregation.id,
        childId: child.id,
        pastorId: input.pastorId,
        dedicatedOn: input.dedicatedOn,
        fatherId: father?.personId ?? null,
        fatherName: father?.name ?? null,
        motherId: mother?.personId ?? null,
        motherName: mother?.name ?? null,
      };
      this.store.dedications.push(row);
      this.audit('ChildDedication', row.id, row.congregationId, 'CHILD_DEDICATION_RECORDED', {
        congregationId: { from: null, to: row.congregationId },
      });
      return this.toDedication(row);
    });
  }

  marriages(): Observable<Marriage[]> {
    const rows = this.visibleMarriages().sort((a, b) =>
      (b.marriedOn ?? '').localeCompare(a.marriedOn ?? ''),
    );
    return demoResponse(rows.map((row) => this.toMarriage(row)));
  }

  createMarriage(input: MarriageInput): Observable<Marriage> {
    return demoCommand(() => {
      this.assertCanWrite();
      if (input.spouse1Id === input.spouse2Id) {
        throw new DomainError('SAME_PERSON', 'Los cónyuges deben ser personas distintas.');
      }
      const spouses = [this.assertPerson(input.spouse1Id), this.assertPerson(input.spouse2Id)];
      const { congregationId } = this.auth.tenant();
      if (congregationId !== null && !spouses.some((spouse) => this.isMemberOf(spouse.id, congregationId))) {
        throw new DomainError('OUT_OF_SCOPE', 'Al menos uno de los cónyuges debe ser miembro de la sede activa.');
      }
      assertPastDate(input.marriedOn, 'del matrimonio');
      if (spouses.some((spouse) => (ageOn(spouse.birthDate, input.marriedOn) ?? ADULT_AGE) < ADULT_AGE)) {
        throw new DomainError(
          'INVALID_SPOUSE',
          `Los cónyuges deben tener al menos ${ADULT_AGE} años en la fecha del matrimonio.`,
        );
      }
      const place = input.place.trim();
      if (place === '' || place.length > MAX_PLACE_LENGTH) {
        throw new DomainError('INVALID_PLACE', `Indica el lugar de la ceremonia (máximo ${MAX_PLACE_LENGTH} caracteres).`);
      }
      if (!MARRIAGE_REGISTRIES.includes(input.registeredWith)) {
        throw new DomainError('INVALID_REGISTRY', 'Selecciona dónde quedó registrado el matrimonio.');
      }
      if (input.officiantId !== null) {
        this.assertPerson(input.officiantId);
      }
      const ids = spouses.map((spouse) => spouse.id);
      const hasActive = this.store.marriages.some(
        (row) => row.endedOn === null && (ids.includes(row.spouse1Id) || ids.includes(row.spouse2Id)),
      );
      if (hasActive) {
        throw new DomainError(
          'ACTIVE_MARRIAGE_EXISTS',
          'Uno de los cónyuges ya tiene un matrimonio vigente. Registra primero su disolución.',
        );
      }

      const [spouse1Id, spouse2Id] = [...ids].sort((a, b) => a - b);
      const row: MarriageRow = {
        id: this.store.nextId(this.store.marriages),
        denominationId: spouses[0].denominationId,
        spouse1Id,
        spouse2Id,
        registeredWith: input.registeredWith,
        marriedOn: input.marriedOn,
        place,
        officiantId: input.officiantId,
        endedOn: null,
        endReason: null,
      };
      this.store.marriages.push(row);
      this.audit('Marriage', row.id, congregationId, 'MARRIAGE_RECORDED', {
        registeredWith: { from: null, to: row.registeredWith },
      });
      return this.toMarriage(row);
    });
  }

  dissolveMarriage(id: number, input: MarriageDissolutionInput): Observable<Marriage> {
    return demoCommand(() => {
      this.assertCanWrite();
      const current = this.visibleMarriages().find((row) => row.id === id);
      if (!current) {
        throw new DomainError('NOT_FOUND', 'El matrimonio no existe o no pertenece a tu sede.');
      }
      if (current.endedOn !== null) {
        throw new DomainError('ALREADY_DISSOLVED', 'Este matrimonio ya tiene registrada su disolución.');
      }
      if (!MARRIAGE_END_REASONS.includes(input.endReason)) {
        throw new DomainError('INVALID_END_REASON', 'Selecciona el motivo de la disolución.');
      }
      assertPastDate(input.endedOn, 'de la disolución');
      if (current.marriedOn && input.endedOn < current.marriedOn) {
        throw new DomainError('INVALID_DATE', 'La disolución no puede ser anterior a la fecha del matrimonio.');
      }

      const updated: MarriageRow = { ...current, endedOn: input.endedOn, endReason: input.endReason };
      this.store.marriages[this.store.marriages.findIndex((row) => row.id === id)] = updated;
      this.audit('Marriage', id, this.auth.tenant().congregationId, 'MARRIAGE_DISSOLVED', {
        status: { from: 'ACTIVE', to: 'DISSOLVED' },
        endReason: { from: null, to: input.endReason },
      });
      return this.toMarriage(updated);
    });
  }

  pastoralTerms(): Observable<PastoralTerm[]> {
    const rows = this.store.pastoralTerms
      .filter((row) => this.inScope(row))
      .sort((a, b) => a.congregationId - b.congregationId || b.startedOn.localeCompare(a.startedOn));
    return demoResponse(rows.map((row) => this.toTerm(row)));
  }

  createPastoralTerm(input: PastoralTermInput): Observable<PastoralTerm> {
    return demoCommand(() => {
      this.assertCanWrite();
      const congregation = this.assertCongregation(input.congregationId);
      const pastor = this.assertPerson(input.pastorId);
      assertIsoDate(input.startedOn, 'Indica una fecha de inicio válida.');
      if (input.endedOn !== null) {
        assertIsoDate(input.endedOn, 'Indica una fecha de fin válida.');
        if (input.endedOn < input.startedOn) {
          throw new DomainError('INVALID_DATE', 'La fecha de fin no puede ser anterior a la de inicio.');
        }
      }

      const sedeTerms = this.store.pastoralTerms.filter((row) => row.congregationId === congregation.id);
      const open = sedeTerms.find((row) => row.endedOn === null);
      const closing =
        input.closeCurrent && open && open.startedOn < input.startedOn
          ? { ...open, endedOn: previousDay(input.startedOn) }
          : null;
      const others = sedeTerms.map((row) => (closing && row.id === closing.id ? closing : row));
      const overlaps = others.some(
        (row) => row.startedOn <= (input.endedOn ?? OPEN_END) && input.startedOn <= (row.endedOn ?? OPEN_END),
      );
      if (overlaps) {
        throw new DomainError(
          'OVERLAPPING_TERM',
          'Las fechas se solapan con otro periodo pastoral de la sede. Ajusta las fechas o cierra el periodo actual.',
        );
      }

      if (closing) {
        this.store.pastoralTerms[this.store.pastoralTerms.findIndex((row) => row.id === closing.id)] = closing;
        this.audit('PastoralTerm', closing.id, congregation.id, 'PASTORAL_TERM_CLOSED', {
          endedOn: { from: null, to: closing.endedOn },
        });
      }
      const row: PastoralTermRow = {
        id: this.store.nextId(this.store.pastoralTerms),
        denominationId: congregation.denominationId,
        congregationId: congregation.id,
        pastorId: pastor.id,
        startedOn: input.startedOn,
        endedOn: input.endedOn,
      };
      this.store.pastoralTerms.push(row);
      this.audit('PastoralTerm', row.id, congregation.id, 'PASTORAL_TERM_RECORDED', {
        startedOn: { from: null, to: row.startedOn },
        endedOn: { from: null, to: row.endedOn },
      });
      return this.toTerm(row);
    });
  }

  // Scope

  private scopedCongregations(): Congregation[] {
    const { denominationId, congregationId } = this.auth.tenant();
    if (denominationId === null) {
      return [];
    }
    return this.db.congregations.filter(
      (congregation) =>
        congregation.denominationId === denominationId &&
        congregation.isActive &&
        (congregationId === null || congregation.id === congregationId),
    );
  }

  /** Rows that carry their sede: same denomination and, for a sede scope, same sede. */
  private inScope(row: { readonly denominationId: number; readonly congregationId: number }): boolean {
    const { denominationId, congregationId } = this.auth.tenant();
    return (
      row.denominationId === denominationId && (congregationId === null || row.congregationId === congregationId)
    );
  }

  /** Marriages have no sede: a sede sees those where a spouse is one of its members. */
  private visibleMarriages(): MarriageRow[] {
    const { denominationId, congregationId } = this.auth.tenant();
    return this.store.marriages.filter(
      (row) =>
        row.denominationId === denominationId &&
        (congregationId === null ||
          this.isMemberOf(row.spouse1Id, congregationId) ||
          this.isMemberOf(row.spouse2Id, congregationId)),
    );
  }

  /**
   * People a scope may list and pick. The whole denomination for a denomination scope; for a sede,
   * its members, the people already linked to its records, and the non-members that no other
   * sede has linked (Person carries no sede, so a new non-member is not yet tied to any sede).
   */
  private scopedPeople(): Person[] {
    const { denominationId, congregationId } = this.auth.tenant();
    if (denominationId === null) {
      return [];
    }
    const persons = this.db.persons.filter((person) => person.denominationId === denominationId);
    if (congregationId === null) {
      return persons;
    }
    const linkedHere = this.linkedPersonIds(denominationId, congregationId);
    const linkedAnywhere = this.linkedPersonIds(denominationId, null);
    return persons.filter((person) => {
      if (linkedHere.has(person.id)) {
        return true;
      }
      const member = this.db.members.find((item) => item.personId === person.id);
      return member ? member.congregationId === congregationId : !linkedAnywhere.has(person.id);
    });
  }

  /** Person ids referenced by the records of a sede (or of every sede when `congregationId` is null). */
  private linkedPersonIds(denominationId: number, congregationId: number | null): Set<number> {
    const inSede = (row: { readonly denominationId: number; readonly congregationId: number }) =>
      row.denominationId === denominationId && (congregationId === null || row.congregationId === congregationId);
    const ids: (number | null)[] = [];
    for (const row of this.store.dedications.filter(inSede)) {
      ids.push(row.childId, row.pastorId, row.fatherId, row.motherId);
    }
    for (const row of this.store.pastoralTerms.filter(inSede)) {
      ids.push(row.pastorId);
    }
    for (const row of this.store.marriages) {
      if (
        row.denominationId === denominationId &&
        (congregationId === null ||
          this.isMemberOf(row.spouse1Id, congregationId) ||
          this.isMemberOf(row.spouse2Id, congregationId))
      ) {
        ids.push(row.spouse1Id, row.spouse2Id, row.officiantId);
      }
    }
    return new Set(ids.filter((id): id is number => id !== null));
  }

  private isMemberOf(personId: number, congregationId: number): boolean {
    return this.db.members.some((member) => member.personId === personId && member.congregationId === congregationId);
  }

  // Validation

  private assertCanWrite(): void {
    if (!this.auth.can('members.write')) {
      throw new DomainError('FORBIDDEN', 'No tienes permiso para editar los registros de secretaría.');
    }
  }

  private assertCongregation(congregationId: number): Congregation {
    const congregation = this.scopedCongregations().find((item) => item.id === congregationId);
    if (!congregation) {
      throw new DomainError('FORBIDDEN', 'No puedes registrar datos en esa sede.');
    }
    return congregation;
  }

  /** A person of the active denomination; ids of other tenants look like missing rows. */
  private assertPerson(personId: number): Person {
    const person = this.db.person(personId);
    if (!person || person.denominationId !== this.auth.tenant().denominationId) {
      throw new DomainError('PERSON_NOT_FOUND', 'La persona seleccionada no pertenece a la denominación.');
    }
    return person;
  }

  /** A person the active scope may see: for a sede, not a member or contact of another sede. */
  private assertPersonInScope(personId: number): Person {
    const person = this.assertPerson(personId);
    if (!this.scopedPeople().some((item) => item.id === person.id)) {
      throw new DomainError('OUT_OF_SCOPE', 'La persona seleccionada pertenece a otra sede.');
    }
    return person;
  }

  private parent(input: ParentInput | null, childId: number): ParentInput | null {
    if (!input) {
      return null;
    }
    if (input.personId !== null) {
      if (input.personId === childId) {
        throw new DomainError('INVALID_PARENT', 'El niño o la niña no puede figurar como su propio padre o madre.');
      }
      return { personId: this.assertPersonInScope(input.personId).id, name: null };
    }
    const name = input.name?.trim() ?? '';
    if (name === '') {
      return null;
    }
    if (name.length > MAX_NAME_LENGTH) {
      throw new DomainError('INVALID_PARENT', `El nombre admite máximo ${MAX_NAME_LENGTH} caracteres.`);
    }
    return { personId: null, name };
  }

  // Mapping

  private summary(person: Person): PersonSummary {
    const member = this.db.members.find((item) => item.personId === person.id);
    const memberCode = member ? this.db.memberCode(member.id) : null;
    return {
      id: person.id,
      fullName: personFullName(person),
      memberCode: memberCode === '—' ? null : memberCode,
      congregationId: member?.congregationId ?? null,
      sex: person.sex,
      birthDate: person.birthDate,
      maskedDocument: person.documentNumber
        ? `${person.documentTypeCode ?? 'DOC'} ···· ${person.documentNumber.slice(-4)}`
        : null,
    };
  }

  private summaryOf(personId: number | null): PersonSummary | null {
    const person = personId === null ? undefined : this.db.person(personId);
    return person ? this.summary(person) : null;
  }

  private parentReference(personId: number | null, name: string | null): ParentReference | null {
    const person = this.summaryOf(personId);
    if (person) {
      return { personId: person.id, name: person.fullName, memberCode: person.memberCode };
    }
    return name ? { personId: null, name, memberCode: null } : null;
  }

  private toDedication(row: ChildDedicationRow): ChildDedication {
    return {
      id: row.id,
      denominationId: row.denominationId,
      congregationId: row.congregationId,
      dedicatedOn: row.dedicatedOn,
      child: this.summaryOf(row.childId) as PersonSummary,
      pastor: this.summaryOf(row.pastorId),
      father: this.parentReference(row.fatherId, row.fatherName),
      mother: this.parentReference(row.motherId, row.motherName),
    };
  }

  private toMarriage(row: MarriageRow): Marriage {
    return {
      id: row.id,
      denominationId: row.denominationId,
      spouse1: this.summaryOf(row.spouse1Id) as PersonSummary,
      spouse2: this.summaryOf(row.spouse2Id) as PersonSummary,
      registeredWith: row.registeredWith,
      marriedOn: row.marriedOn,
      place: row.place,
      officiant: this.summaryOf(row.officiantId),
      endedOn: row.endedOn,
      endReason: row.endReason,
    };
  }

  private toTerm(row: PastoralTermRow): PastoralTerm {
    return {
      id: row.id,
      denominationId: row.denominationId,
      congregationId: row.congregationId,
      pastor: this.summaryOf(row.pastorId) as PersonSummary,
      startedOn: row.startedOn,
      endedOn: row.endedOn,
    };
  }

  private audit(
    entity: string,
    entityId: number,
    congregationId: number | null,
    action: string,
    changes: Record<string, { from: string | number | null; to: string | number | null }>,
  ): void {
    this.db.audit({
      userId: this.auth.user()?.id ?? null,
      denominationId: this.auth.tenant().denominationId,
      congregationId,
      entity,
      entityId: String(entityId),
      action,
      changes,
    });
  }
}

function assertIsoDate(value: string, message: string): void {
  if (!ISO_DATE.test(value) || Number.isNaN(Date.parse(value))) {
    throw new DomainError('INVALID_DATE', message);
  }
}

function assertPastDate(value: string, subject: string): void {
  assertIsoDate(value, `Indica una fecha válida ${subject}.`);
  if (value > todayIso()) {
    throw new DomainError('INVALID_DATE', `La fecha ${subject} no puede ser futura.`);
  }
}
