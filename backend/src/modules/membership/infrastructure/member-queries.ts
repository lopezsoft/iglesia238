import { toIsoDateOrNull } from '../../../common/mappers/value-mappers.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { formatMemberCode } from '../application/person-text.js';
import { displayName } from '../application/person-text.js';

/** The newest registry entry of a member and the code of the congregation it belongs to. */
export const LATEST_REGISTRY_ENTRY = {
  orderBy: [{ startedOn: 'desc' }, { id: 'desc' }],
  take: 1,
  include: { congregation: { select: { code: true } } },
} satisfies Prisma.Member$memberRegistryEntriesArgs;

export const PRIMARY_PHONE = {
  where: { type: { in: ['MOBILE', 'LANDLINE'] } },
  orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
  take: 1,
} satisfies Prisma.Person$personContactsArgs;

export const PRIMARY_EMAIL = {
  where: { type: 'EMAIL' },
  orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
  take: 1,
} satisfies Prisma.Person$personContactsArgs;

export const listRowArgs = {
  include: {
    person: {
      include: {
        documentType: { select: { code: true } },
        personContacts: PRIMARY_PHONE,
      },
    },
    congregation: { select: { name: true } },
    memberRegistryEntries: LATEST_REGISTRY_ENTRY,
    memberPositions: {
      where: { endedOn: null },
      include: { position: { select: { name: true } } },
    },
  },
} satisfies Prisma.MemberDefaultArgs;

export type ListRowPayload = Prisma.MemberGetPayload<typeof listRowArgs>;

export const detailArgs = {
  include: {
    person: {
      include: {
        documentType: { select: { code: true } },
        documentIssuePlace: { select: { code: true } },
        birthPlace: { select: { code: true } },
        maritalStatus: { select: { code: true } },
        educationLevel: { select: { code: true } },
        personContacts: {
          where: { type: { in: ['MOBILE', 'LANDLINE', 'EMAIL', 'WORK_PHONE'] } },
          orderBy: [{ isPrimary: 'desc' }, { id: 'asc' }],
        },
        personAddresses: {
          where: { isCurrent: true },
          orderBy: { id: 'desc' },
          take: 1,
          include: {
            municipality: { select: { code: true } },
            neighborhood: { select: { name: true } },
          },
        },
      },
    },
    baptismMunicipality: { select: { code: true } },
    baptizingPastor: {
      select: {
        firstName: true,
        lastName: true,
        secondLastName: true,
        fullName: true,
      },
    },
    congregation: {
      select: {
        id: true,
        name: true,
        municipality: { select: { code: true } },
      },
    },
    memberRegistryEntries: LATEST_REGISTRY_ENTRY,
  },
} satisfies Prisma.MemberDefaultArgs;

export type DetailPayload = Prisma.MemberGetPayload<typeof detailArgs>;

type RegistryEntryWithCode = {
  memberNumber: number;
  congregation: { code: string };
};

export function memberCodeOf(
  entries: readonly RegistryEntryWithCode[],
): string {
  const entry = entries[0];
  return entry
    ? formatMemberCode(entry.congregation.code, entry.memberNumber)
    : '—';
}

export function personNames(person: {
  firstName: string | null;
  lastName: string | null;
  secondLastName: string | null;
  fullName: string | null;
}): string {
  return displayName(person);
}

export function isoOrNull(value: Date | null): string | null {
  return toIsoDateOrNull(value);
}
