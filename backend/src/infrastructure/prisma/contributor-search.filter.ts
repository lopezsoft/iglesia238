import { normalizeDocumentNumber } from '../../common/people/document-number.js';
import type { Prisma } from '../../generated/prisma/client.js';

/** "SC-0148": the code of the congregation and the member number inside it. */
const MEMBER_CODE = /^([A-Za-z0-9]{1,10})-(\d{1,9})$/;
const MAX_TOKENS = 5;

/**
 * `where` fragment of a Person that matches what a person types in a picker: every word must match
 * the name, the surnames or the start of the document, or the whole text can be the member code.
 * Used by the contributor search of Aportes and by the search box of Votos.
 */
export function personMatchesText(text: string): Prisma.PersonWhereInput {
  const query = text.trim();
  const alternatives: Prisma.PersonWhereInput[] = [];

  const code = MEMBER_CODE.exec(query);
  if (code) {
    alternatives.push({
      member: {
        is: {
          memberRegistryEntries: {
            some: {
              memberNumber: Number(code[2]),
              endedOn: null,
              congregation: { code: code[1].toUpperCase() },
            },
          },
        },
      },
    });
  }

  const tokens = query.split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);
  if (tokens.length > 0) {
    alternatives.push({
      AND: tokens.map((token) => {
        const document = normalizeDocumentNumber(token);
        return {
          OR: [
            { firstName: { contains: token } },
            { lastName: { contains: token } },
            { secondLastName: { contains: token } },
            { fullName: { contains: token } },
            ...(document !== ''
              ? [{ documentNumber: { startsWith: document } }]
              : []),
          ],
        };
      }),
    });
  }
  return { OR: alternatives };
}

/** Select of the current registry entry of a member: the one that has not ended. */
export const CURRENT_REGISTRY_ENTRY = {
  where: { endedOn: null },
  orderBy: { id: 'desc' },
  take: 1,
  select: {
    memberNumber: true,
    congregation: { select: { code: true } },
  },
} as const;
