export const PERSON_NAME_SELECT = {
  firstName: true,
  lastName: true,
  secondLastName: true,
  fullName: true,
} as const;

interface NameParts {
  firstName: string | null;
  lastName: string | null;
  secondLastName: string | null;
  fullName: string | null;
}

/** "Ana María Pérez Gómez"; relatives registered only by `fullName` fall back to it. */
export function composePersonName(person: NameParts): string {
  const composed = [person.firstName, person.lastName, person.secondLastName]
    .filter((part): part is string => !!part && part.trim() !== '')
    .join(' ');
  return composed !== '' ? composed : (person.fullName ?? '').trim();
}

/** A word matches any name field of a person. */
export function personNameAnyOf(term: string) {
  return [
    { firstName: { contains: term } },
    { lastName: { contains: term } },
    { secondLastName: { contains: term } },
    { fullName: { contains: term } },
  ];
}

/** Prisma `where` that every word of the query must satisfy on some name field of a person. */
export function personNameFilters(query: string) {
  return query
    .trim()
    .split(/\s+/)
    .filter((term) => term !== '')
    .slice(0, 6)
    .map((term) => ({ OR: personNameAnyOf(term) }));
}
