import type { Prisma } from '../../../generated/prisma/client.js';
import { CURRENT_REGISTRY_ENTRY } from '../../../infrastructure/prisma/contributor-search.filter.js';
import type { ContributorCandidate } from '../application/search-contributors.use-case.js';

export const CONTRIBUTOR_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  fullName: true,
  documentNumber: true,
  documentType: { select: { code: true } },
  member: {
    select: {
      congregationId: true,
      congregation: { select: { name: true, code: true } },
      memberRegistryEntries: CURRENT_REGISTRY_ENTRY,
    },
  },
} satisfies Prisma.PersonSelect;

export type ContributorRow = Prisma.PersonGetPayload<{
  select: typeof CONTRIBUTOR_SELECT;
}>;

/** Projection of a person with a member record, for the pledge detail. Members of other denominations are never read. */
export function toContributorCandidate(
  row: ContributorRow,
): ContributorCandidate | null {
  if (!row.member) {
    return null;
  }
  return {
    personId: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    fullName: row.fullName,
    documentTypeCode: row.documentType?.code ?? null,
    documentNumber: row.documentNumber,
    memberNumber: row.member.memberRegistryEntries[0]?.memberNumber ?? null,
    congregationId: row.member.congregationId,
    congregationCode: row.member.congregation.code,
    congregationName: row.member.congregation.name,
  };
}
