import { Injectable } from '@angular/core';
import { AuditLogEntry, User, UserRoleAssignment } from '../models/identity.model';
import {
  DataConsent,
  Member,
  MemberRegistryEntry,
  MembershipApplication,
  Person,
  PrivacyPolicy,
} from '../models/membership.model';
import { Congregation, Denomination, District, LegalEntity } from '../models/organization.model';
import {
  AUDIT_LOGS,
  CONGREGATIONS,
  DATA_CONSENTS,
  DENOMINATIONS,
  DISTRICTS,
  LEGAL_ENTITIES,
  MEMBERS,
  MEMBERSHIP_APPLICATIONS,
  MEMBER_REGISTRY_ENTRIES,
  PERSONS,
  PRIVACY_POLICIES,
  USERS,
  USER_ROLES,
} from './demo-fixtures';

interface WithId {
  readonly id: number;
}

/**
 * In-memory tables shared by the demo adapters of every module, so a change made in one
 * screen (an approved application) shows up in the others (the member list). It lives for the
 * browser session only. Feature-specific tables (accounting, secretariat) live in each feature.
 *
 * Only demo adapters may inject it: components and use cases depend on repository ports.
 */
@Injectable({ providedIn: 'root' })
export class DemoDatabase {
  readonly denominations: Denomination[] = structuredClone(DENOMINATIONS);
  readonly legalEntities: LegalEntity[] = structuredClone(LEGAL_ENTITIES);
  readonly districts: District[] = structuredClone(DISTRICTS);
  readonly congregations: Congregation[] = structuredClone(CONGREGATIONS);
  readonly users: User[] = structuredClone(USERS);
  readonly userRoles: UserRoleAssignment[] = structuredClone(USER_ROLES);
  readonly privacyPolicies: PrivacyPolicy[] = structuredClone(PRIVACY_POLICIES);
  readonly persons: Person[] = structuredClone(PERSONS);
  readonly members: Member[] = structuredClone(MEMBERS);
  readonly memberRegistryEntries: MemberRegistryEntry[] = structuredClone(MEMBER_REGISTRY_ENTRIES);
  readonly membershipApplications: MembershipApplication[] = structuredClone(MEMBERSHIP_APPLICATIONS);
  readonly dataConsents: DataConsent[] = structuredClone(DATA_CONSENTS);
  readonly auditLogs: AuditLogEntry[] = structuredClone(AUDIT_LOGS);

  nextId(table: readonly WithId[]): number {
    return table.reduce((max, row) => Math.max(max, row.id), 0) + 1;
  }

  /** Replaces the row with the same id; the tables hold immutable rows. */
  replace<T extends WithId>(table: T[], row: T): T {
    const index = table.findIndex((item) => item.id === row.id);
    if (index === -1) {
      throw new Error(`Row ${row.id} not found`);
    }
    table[index] = row;
    return row;
  }

  audit(entry: Omit<AuditLogEntry, 'id' | 'createdAt' | 'ipAddress'>): void {
    this.auditLogs.push({
      ...entry,
      id: this.nextId(this.auditLogs),
      ipAddress: '127.0.0.1',
      createdAt: new Date().toISOString(),
    });
  }

  congregation(id: number): Congregation | undefined {
    return this.congregations.find((congregation) => congregation.id === id);
  }

  person(id: number): Person | undefined {
    return this.persons.find((person) => person.id === id);
  }

  /** Current registry entry (open) of a member: it carries the member number of the sede. */
  currentRegistryEntry(memberId: number): MemberRegistryEntry | undefined {
    return this.memberRegistryEntries.find((entry) => entry.memberId === memberId && entry.endedOn === null);
  }

  /** Display code of a member in its sede, e.g. SC-0148 for number 148 of Sede Central. */
  memberCode(memberId: number): string {
    const entry = this.currentRegistryEntry(memberId);
    if (!entry) {
      return '—';
    }
    return formatMemberCode(this.congregation(entry.congregationId)?.name ?? '', entry.memberNumber);
  }
}

/** Initials of the significant words of the sede name plus the zero-padded member number. */
export function formatMemberCode(congregationName: string, memberNumber: number): string {
  const initials = congregationName
    .split(/\s+/)
    .filter((word) => word.length > 2 && /^\p{Lu}/u.test(word))
    .map((word) => word[0])
    .join('')
    .slice(0, 3);
  return `${initials || 'M'}-${String(memberNumber).padStart(4, '0')}`;
}
