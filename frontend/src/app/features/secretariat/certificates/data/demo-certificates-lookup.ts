// Read helpers over the shared demo tables, used by the demo store (seed snapshots) and the demo
// adapter. Only demo code imports this file.
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { DEMO_MUNICIPALITIES } from '../../../../core/models/catalogs';
import { Member, personFullName } from '../../../../core/models/membership.model';
import { documentLabel } from './certificate-document';
import { Letterhead, MemberOption, Signers } from './certificates.models';

export interface SignerIds {
  readonly pastorSignerId: number | null;
  readonly secretarySignerId: number | null;
}

export function letterheadOf(db: DemoDatabase, congregationId: number): Letterhead {
  const congregation = db.congregation(congregationId);
  if (!congregation) {
    throw new Error(`Congregation ${congregationId} not found`);
  }
  const denomination = db.denominations.find((item) => item.id === congregation.denominationId);
  const legalEntity = db.legalEntities.find((item) => item.id === congregation.legalEntityId);
  const district = db.districts.find((item) => item.id === congregation.districtId);
  const cityName =
    DEMO_MUNICIPALITIES.find((item) => item.code === congregation.municipalityCode)?.name ?? '—';
  return {
    denominationName: denomination?.name ?? '',
    legalName: legalEntity?.legalName ?? '',
    taxId: legalEntity?.taxId ?? '',
    congregationName: congregation.name,
    cityName,
    locationLine: [congregation.name, cityName, district ? `Distrito ${district.number}` : null]
      .filter((part): part is string => !!part && part !== '—')
      .join(' · '),
  };
}

/** Current pastor and secretary of the sede: the active PASTOR and SECRETARY role holders. */
export function signersOf(db: DemoDatabase, congregationId: number): Signers & SignerIds {
  const holder = (role: 'PASTOR' | 'SECRETARY') => {
    const assignment = db.userRoles.find(
      (item) =>
        item.role === role && item.congregationId === congregationId && item.revokedAt === null,
    );
    const user = assignment ? db.users.find((item) => item.id === assignment.userId) : undefined;
    const person = user ? db.persons.find((item) => item.userId === user.id) : undefined;
    return { name: user?.displayName ?? null, personId: person?.id ?? null };
  };
  const pastor = holder('PASTOR');
  const secretary = holder('SECRETARY');
  return {
    pastorName: pastor.name,
    secretaryName: secretary.name,
    pastorSignerId: pastor.personId,
    secretarySignerId: secretary.personId,
  };
}

export function memberOptionOf(db: DemoDatabase, member: Member): MemberOption {
  const person = db.person(member.personId);
  return {
    id: member.id,
    fullName: person ? personFullName(person) : '—',
    code: db.memberCode(member.id),
    documentLabel: documentLabel(person?.documentTypeCode ?? null, person?.documentNumber ?? null),
    joinedOn: member.joinedOn,
    isBaptized: member.isBaptized === true,
    waterBaptismOn: member.waterBaptismOn,
  };
}

export function userName(db: DemoDatabase, userId: number): string {
  return db.users.find((user) => user.id === userId)?.displayName ?? '—';
}
