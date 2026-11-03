import { ageOn } from '../../../common/people/age.js';
import { composeFullName } from '../../../common/people/full-name.js';
import { toIsoDateOrNull } from '../../../common/mappers/value-mappers.js';
import { formatMemberCode } from '../../../common/numbering/document-numbering.service.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import type {
  ParentReference,
  PersonSummary,
} from '../application/records.models.js';

/** What is read of a person to summarize them. Addresses, phones and the like never leave the table. */
export const personSummarySelect = {
  id: true,
  firstName: true,
  lastName: true,
  secondLastName: true,
  fullName: true,
  sex: true,
  birthDate: true,
  documentNumber: true,
  documentType: { select: { code: true } },
  member: {
    select: {
      congregationId: true,
      memberRegistryEntries: {
        where: { endedOn: null },
        select: {
          memberNumber: true,
          congregation: { select: { code: true } },
        },
        take: 1,
      },
    },
  },
} satisfies Prisma.PersonSelect;

export type PersonSummaryRow = Prisma.PersonGetPayload<{
  select: typeof personSummarySelect;
}>;

const MASK = '····';

/** "TI ···· 4817": enough to recognize a person, never the whole number. */
export function maskDocument(
  typeCode: string | null | undefined,
  documentNumber: string | null,
): string | null {
  if (!documentNumber) {
    return null;
  }
  return [typeCode, MASK, documentNumber.slice(-4)].filter(Boolean).join(' ');
}

export function toPersonSummary(
  row: PersonSummaryRow,
  today: string,
): PersonSummary {
  const birthDate = toIsoDateOrNull(row.birthDate);
  const entry = row.member?.memberRegistryEntries[0];
  return {
    id: row.id,
    fullName:
      composeFullName(row.firstName, row.lastName, row.secondLastName) ||
      row.fullName ||
      'Sin nombre',
    memberCode: entry
      ? formatMemberCode(entry.congregation.code, entry.memberNumber)
      : null,
    congregationId: row.member?.congregationId ?? null,
    sex: row.sex,
    birthDate,
    age: birthDate ? ageOn(birthDate, today) : null,
    maskedDocument: maskDocument(row.documentType?.code, row.documentNumber),
  };
}

export function toParentReference(person: PersonSummary): ParentReference {
  return {
    personId: person.id,
    name: person.fullName,
    memberCode: person.memberCode,
  };
}

/** Words of a search text, each matched against the name parts of a person. */
export function nameTokens(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .filter((token) => token !== '')
    .slice(0, 5);
}

export function personNameMatches(token: string): Prisma.PersonWhereInput {
  return {
    OR: [
      { firstName: { contains: token } },
      { lastName: { contains: token } },
      { secondLastName: { contains: token } },
      { fullName: { contains: token } },
    ],
  };
}
