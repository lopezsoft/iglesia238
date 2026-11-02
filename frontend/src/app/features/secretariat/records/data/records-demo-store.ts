import { Injectable } from '@angular/core';
import { MarriageEndReason, MarriageRegistry } from './records.models';

// Rows as the API stores them (ids, no resolved names). Every person id references the shared
// fictional persons of DemoDatabase: 1–27 Sede Central, 28–39 Sede Norte, 40–47 Sede Soacha
// (denomination 1) and 48–55 denomination 2, which proves tenant isolation.

export interface ChildDedicationRow {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly childId: number;
  readonly pastorId: number | null;
  readonly dedicatedOn: string;
  readonly fatherId: number | null;
  readonly fatherName: string | null;
  readonly motherId: number | null;
  readonly motherName: string | null;
}

export interface MarriageRow {
  readonly id: number;
  readonly denominationId: number;
  /** Always the lower person id of the couple, as sql/constraints.sql enforces. */
  readonly spouse1Id: number;
  readonly spouse2Id: number;
  readonly registeredWith: MarriageRegistry | null;
  readonly marriedOn: string | null;
  readonly place: string | null;
  readonly officiantId: number | null;
  readonly endedOn: string | null;
  readonly endReason: MarriageEndReason | null;
}

export interface PastoralTermRow {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly pastorId: number;
  readonly startedOn: string;
  readonly endedOn: string | null;
}

const PASTORAL_TERMS: readonly PastoralTermRow[] = [
  { id: 1, denominationId: 1, congregationId: 1, pastorId: 27, startedOn: '1994-01-15', endedOn: '2002-06-30' },
  { id: 2, denominationId: 1, congregationId: 1, pastorId: 23, startedOn: '2002-07-01', endedOn: '2011-02-28' },
  { id: 3, denominationId: 1, congregationId: 1, pastorId: 19, startedOn: '2011-03-01', endedOn: '2019-01-31' },
  { id: 4, denominationId: 1, congregationId: 1, pastorId: 1, startedOn: '2019-02-01', endedOn: null },
  { id: 5, denominationId: 1, congregationId: 2, pastorId: 33, startedOn: '2008-02-01', endedOn: '2015-04-30' },
  { id: 6, denominationId: 1, congregationId: 2, pastorId: 37, startedOn: '2015-05-01', endedOn: null },
  { id: 7, denominationId: 1, congregationId: 3, pastorId: 41, startedOn: '2017-08-01', endedOn: null },
  { id: 8, denominationId: 2, congregationId: 4, pastorId: 49, startedOn: '2012-01-01', endedOn: null },
];

const DEDICATIONS: readonly ChildDedicationRow[] = [
  { id: 1, denominationId: 1, congregationId: 1, childId: 13, pastorId: 27, dedicatedOn: '1994-04-17', fatherId: null, fatherName: 'Gustavo Cárdenas', motherId: null, motherName: 'Elvira Ruiz' },
  { id: 2, denominationId: 1, congregationId: 1, childId: 26, pastorId: 27, dedicatedOn: '1995-09-10', fatherId: 3, fatherName: null, motherId: null, motherName: 'Nubia Salazar' },
  { id: 3, denominationId: 1, congregationId: 1, childId: 9, pastorId: 27, dedicatedOn: '1998-08-16', fatherId: null, fatherName: 'Héctor Muñoz', motherId: null, motherName: 'Amparo Vélez' },
  { id: 4, denominationId: 1, congregationId: 1, childId: 22, pastorId: 27, dedicatedOn: '2000-01-23', fatherId: null, fatherName: 'Óscar Jiménez', motherId: 20, motherName: null },
  { id: 5, denominationId: 1, congregationId: 1, childId: 18, pastorId: 23, dedicatedOn: '2003-05-18', fatherId: 1, fatherName: null, motherId: null, motherName: 'Gloria Muñoz' },
  { id: 6, denominationId: 1, congregationId: 2, childId: 35, pastorId: null, dedicatedOn: '2000-06-11', fatherId: null, fatherName: 'Pedro Rodríguez', motherId: null, motherName: 'Lucía Gil' },
  { id: 7, denominationId: 1, congregationId: 2, childId: 31, pastorId: null, dedicatedOn: '2004-10-03', fatherId: null, fatherName: 'Arturo Vargas', motherId: 32, motherName: null },
  { id: 8, denominationId: 1, congregationId: 3, childId: 44, pastorId: null, dedicatedOn: '2006-03-12', fatherId: null, fatherName: 'Ramiro Pérez', motherId: 42, motherName: null },
  { id: 9, denominationId: 2, congregationId: 4, childId: 48, pastorId: null, dedicatedOn: '2001-11-18', fatherId: null, fatherName: 'Iván Molina', motherId: 50, motherName: null },
];

const MARRIAGES: readonly MarriageRow[] = [
  { id: 1, denominationId: 1, spouse1Id: 10, spouse2Id: 23, registeredWith: 'CHURCH', marriedOn: '1980-02-09', place: 'Sede Central · Templo principal', officiantId: null, endedOn: '2023-05-02', endReason: 'DIVORCE' },
  { id: 2, denominationId: 1, spouse1Id: 2, spouse2Id: 19, registeredWith: 'CHURCH', marriedOn: '1988-05-14', place: 'Sede Central · Templo principal', officiantId: null, endedOn: null, endReason: null },
  { id: 3, denominationId: 1, spouse1Id: 8, spouse2Id: 25, registeredWith: 'NOTARY', marriedOn: '2012-03-17', place: 'Notaría 12 de Bogotá', officiantId: null, endedOn: null, endReason: null },
  { id: 4, denominationId: 1, spouse1Id: 4, spouse2Id: 21, registeredWith: 'CHURCH', marriedOn: '2014-09-20', place: 'Sede Central · Templo principal', officiantId: 19, endedOn: null, endReason: null },
  { id: 5, denominationId: 1, spouse1Id: 29, spouse2Id: 30, registeredWith: 'CHURCH', marriedOn: '2016-11-05', place: 'Sede Norte · Auditorio', officiantId: 37, endedOn: null, endReason: null },
  { id: 6, denominationId: 1, spouse1Id: 12, spouse2Id: 13, registeredWith: 'CHURCH', marriedOn: '2018-03-17', place: 'Sede Central · Templo principal', officiantId: 19, endedOn: '2024-08-22', endReason: 'DIVORCE' },
  { id: 7, denominationId: 1, spouse1Id: 7, spouse2Id: 16, registeredWith: 'CHURCH', marriedOn: '2026-07-18', place: 'Sede Central · Salón social', officiantId: 1, endedOn: null, endReason: null },
  { id: 8, denominationId: 2, spouse1Id: 49, spouse2Id: 50, registeredWith: 'CHURCH', marriedOn: '1995-06-24', place: 'Vida Nueva Chapinero', officiantId: null, endedOn: null, endReason: null },
];

/** In-memory secretariat records of the demo. Only the demo adapter injects it. */
@Injectable({ providedIn: 'root' })
export class RecordsDemoStore {
  readonly dedications: ChildDedicationRow[] = structuredClone([...DEDICATIONS]);
  readonly marriages: MarriageRow[] = structuredClone([...MARRIAGES]);
  readonly pastoralTerms: PastoralTermRow[] = structuredClone([...PASTORAL_TERMS]);

  nextId(table: readonly { readonly id: number }[]): number {
    return table.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  }
}
