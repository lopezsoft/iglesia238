// Fictional demo data. No record comes from real people: names are combined from generic lists.
// Denomination 1 (Monte de Sion) is the main demo tenant; denomination 2 proves isolation.
import { RoleCode } from '../auth/role';
import { ScopeKind } from '../auth/session.model';
import { AuditLogEntry, User, UserRoleAssignment } from '../models/identity.model';
import {
  DataConsent,
  Member,
  MemberRegistryEntry,
  MemberStatus,
  MembershipApplication,
  Person,
  PrivacyPolicy,
  Sex,
} from '../models/membership.model';
import { Congregation, Denomination, District, LegalEntity } from '../models/organization.model';

export const DEMO_PASSWORD = 'Demo2026!';

export const DENOMINATIONS: Denomination[] = [
  { id: 1, name: 'Iglesia Cristiana Monte de Sion', logoPath: null, isActive: true, createdAt: '2026-01-15T14:00:00Z' },
  { id: 2, name: 'Comunidad Cristiana Vida Nueva', logoPath: null, isActive: true, createdAt: '2026-03-02T16:30:00Z' },
  { id: 3, name: 'Iglesia Evangélica Camino de Fe', logoPath: null, isActive: false, createdAt: '2026-05-20T13:10:00Z' },
];

export const LEGAL_ENTITIES: LegalEntity[] = [
  { id: 1, denominationId: 1, legalName: 'Iglesia Cristiana Monte de Sion', tradeName: 'Monte de Sion', taxId: '900.123.456-7', legalRepresentative: 'Daniel Herrera Gil', email: 'contacto@montedesion.example', phone: '601 555 0100', address: 'Calle 45 # 12-30', municipalityCode: '11001', isActive: true },
  { id: 2, denominationId: 1, legalName: 'Fundación Social Monte de Sion', tradeName: null, taxId: '901.234.567-1', legalRepresentative: 'Andrés Molina Restrepo', email: null, phone: null, address: 'Carrera 7 # 80-15', municipalityCode: '11001', isActive: true },
  { id: 3, denominationId: 2, legalName: 'Comunidad Cristiana Vida Nueva', tradeName: 'Vida Nueva', taxId: '900.765.432-0', legalRepresentative: 'Ricardo León Pardo', email: null, phone: null, address: 'Avenida 68 # 22-10', municipalityCode: '11001', isActive: true },
  { id: 4, denominationId: 3, legalName: 'Iglesia Evangélica Camino de Fe', tradeName: null, taxId: '900.555.111-3', legalRepresentative: null, email: null, phone: null, address: null, municipalityCode: '76001', isActive: false },
];

export const DISTRICTS: District[] = [
  { id: 1, denominationId: 1, number: '1', name: 'Distrito Bogotá' },
  { id: 2, denominationId: 1, number: '2', name: 'Distrito Sabana' },
  { id: 3, denominationId: 2, number: '1', name: 'Distrito Centro' },
];

export const CONGREGATIONS: Congregation[] = [
  { id: 1, denominationId: 1, legalEntityId: 1, districtId: 1, municipalityCode: '11001', neighborhood: 'Teusaquillo', name: 'Sede Central', address: 'Calle 45 # 12-30', phone: '601 555 0100', email: 'central@montedesion.example', acceptsApplications: true, isActive: true },
  { id: 2, denominationId: 1, legalEntityId: 1, districtId: 1, municipalityCode: '11001', neighborhood: 'Usaquén', name: 'Sede Norte', address: 'Carrera 19 # 140-22', phone: '601 555 0140', email: 'norte@montedesion.example', acceptsApplications: true, isActive: true },
  { id: 3, denominationId: 1, legalEntityId: 1, districtId: 2, municipalityCode: '25754', neighborhood: 'San Mateo', name: 'Sede Soacha', address: 'Calle 13 # 7-45', phone: '601 555 0170', email: null, acceptsApplications: false, isActive: true },
  { id: 4, denominationId: 2, legalEntityId: 3, districtId: 3, municipalityCode: '11001', neighborhood: 'Chapinero', name: 'Vida Nueva Chapinero', address: 'Calle 60 # 9-12', phone: null, email: null, acceptsApplications: true, isActive: true },
  { id: 5, denominationId: 2, legalEntityId: 3, districtId: 3, municipalityCode: '05001', neighborhood: 'Laureles', name: 'Vida Nueva Medellín', address: 'Circular 1 # 70-08', phone: null, email: null, acceptsApplications: true, isActive: true },
  { id: 6, denominationId: 3, legalEntityId: 4, districtId: null, municipalityCode: '76001', neighborhood: null, name: 'Camino de Fe Cali', address: null, phone: null, email: null, acceptsApplications: false, isActive: false },
];

export const USERS: User[] = [
  { id: 1, email: 'laura.gomez@iglesia238.example', displayName: 'Laura Gómez', isActive: true, lastLoginAt: '2026-11-02T13:05:00Z', invitationPending: false },
  { id: 2, email: 'andres.molina@montedesion.example', displayName: 'Andrés Molina', isActive: true, lastLoginAt: '2026-11-01T22:40:00Z', invitationPending: false },
  { id: 3, email: 'daniel.herrera@montedesion.example', displayName: 'Pastor Daniel Herrera', isActive: true, lastLoginAt: '2026-11-02T11:15:00Z', invitationPending: false },
  { id: 4, email: 'marta.castillo@montedesion.example', displayName: 'Marta Castillo', isActive: true, lastLoginAt: '2026-11-02T12:30:00Z', invitationPending: false },
  { id: 5, email: 'jorge.ramirez@montedesion.example', displayName: 'Jorge Ramírez', isActive: true, lastLoginAt: '2026-10-31T19:20:00Z', invitationPending: false },
  { id: 6, email: 'paola.ruiz@montedesion.example', displayName: 'Paola Ruiz', isActive: true, lastLoginAt: '2026-10-29T15:00:00Z', invitationPending: false },
  { id: 7, email: 'luis.ortega@montedesion.example', displayName: 'Pastor Luis Ortega', isActive: true, lastLoginAt: '2026-10-30T18:45:00Z', invitationPending: false },
  { id: 8, email: 'ricardo.leon@vidanueva.example', displayName: 'Ricardo León', isActive: true, lastLoginAt: '2026-10-28T14:10:00Z', invitationPending: false },
  { id: 9, email: 'sofia.mejia@montedesion.example', displayName: 'Sofía Mejía', isActive: true, lastLoginAt: null, invitationPending: true },
];

function assignment(
  id: number,
  userId: number,
  role: RoleCode,
  scope: ScopeKind,
  denominationId: number | null,
  congregationId: number | null,
  createdAt: string,
  revokedAt: string | null = null,
): UserRoleAssignment {
  return { id, userId, role, scope, denominationId, congregationId, grantedById: userId === 1 ? null : 1, createdAt, revokedAt };
}

export const USER_ROLES: UserRoleAssignment[] = [
  assignment(1, 1, 'PLATFORM_ADMIN', 'PLATFORM', null, null, '2026-01-10T12:00:00Z'),
  assignment(2, 2, 'DENOMINATION_ADMIN', 'DENOMINATION', 1, null, '2026-01-15T14:10:00Z'),
  assignment(3, 3, 'PASTOR', 'CONGREGATION', 1, 1, '2026-01-16T15:00:00Z'),
  assignment(4, 4, 'SECRETARY', 'CONGREGATION', 1, 1, '2026-01-16T15:05:00Z'),
  assignment(5, 5, 'TREASURER', 'CONGREGATION', 1, 1, '2026-01-16T15:10:00Z'),
  assignment(6, 6, 'SECRETARY', 'CONGREGATION', 1, 2, '2026-02-01T13:00:00Z'),
  assignment(7, 6, 'TREASURER', 'CONGREGATION', 1, 3, '2026-02-01T13:05:00Z'),
  assignment(8, 7, 'PASTOR', 'CONGREGATION', 1, 2, '2026-02-03T16:00:00Z'),
  assignment(9, 8, 'DENOMINATION_ADMIN', 'DENOMINATION', 2, null, '2026-03-02T16:40:00Z'),
  assignment(10, 4, 'TREASURER', 'CONGREGATION', 1, 1, '2026-01-16T15:06:00Z', '2026-04-30T17:00:00Z'),
  assignment(11, 9, 'SECRETARY', 'CONGREGATION', 1, 3, '2026-10-30T14:00:00Z'),
];

export const PRIVACY_POLICIES: PrivacyPolicy[] = [
  {
    id: 1,
    denominationId: 1,
    version: '2026-1',
    effectiveFrom: '2026-01-15',
    content:
      'En cumplimiento de la Ley 1581 de 2012, la Iglesia Cristiana Monte de Sion tratará tus datos personales para gestionar tu membresía, comunicarte actividades y cumplir obligaciones legales. Puedes conocer, actualizar, rectificar y suprimir tus datos, y revocar esta autorización en cualquier momento escribiendo a la secretaría de tu sede.',
  },
  {
    id: 2,
    denominationId: 2,
    version: '2026-1',
    effectiveFrom: '2026-03-02',
    content: 'Política de tratamiento de datos personales de la Comunidad Cristiana Vida Nueva (Ley 1581 de 2012).',
  },
];

// People: combined from generic name lists, never from real records.
const FEMALE_NAMES = ['Ana María', 'Luisa Fernanda', 'Diana', 'Carolina', 'Paula Andrea', 'Gloria', 'Sandra', 'Natalia', 'Juliana', 'Rosa Elena', 'Claudia', 'Mariana', 'Esperanza', 'Liliana', 'Camila', 'Beatriz', 'Adriana', 'Yolanda', 'Daniela', 'Patricia', 'Marta', 'Paola'];
const MALE_NAMES = ['Carlos', 'Juan David', 'Andrés Felipe', 'Jorge', 'Luis Alberto', 'Hernán', 'Óscar', 'Mauricio', 'Sebastián', 'Fernando', 'Javier', 'Ricardo', 'Alejandro', 'Diego', 'Germán', 'Camilo', 'Héctor', 'Julián', 'Daniel', 'Manuel'];
const LAST_NAMES = ['Rojas', 'Pérez', 'Gómez', 'Martínez', 'Rodríguez', 'Díaz', 'Torres', 'Ramírez', 'Vargas', 'Castro', 'Moreno', 'Jiménez', 'Ríos', 'Suárez', 'Cárdenas', 'Herrera', 'Mejía', 'Ortiz', 'Muñoz', 'Salazar', 'Castillo', 'Molina', 'Ruiz', 'Gil'];
const OCCUPATIONS = ['Docente', 'Comerciante', 'Contador(a)', 'Enfermero(a)', 'Estudiante', 'Ingeniero(a)', 'Ama de casa', 'Conductor', 'Pensionado(a)', 'Técnico(a) electricista', 'Diseñador(a)', 'Auxiliar administrativo'];

interface PersonSeed {
  readonly congregationId: number;
  readonly firstName: string;
  readonly lastName: string;
  readonly secondLastName: string;
  readonly sex: Sex;
  readonly status: MemberStatus;
  readonly userId?: number;
}

function generatePeople(): PersonSeed[] {
  const seeds: PersonSeed[] = [
    // Demo users who are members of Sede Central.
    { congregationId: 1, firstName: 'Daniel', lastName: 'Herrera', secondLastName: 'Gil', sex: 'MALE', status: 'ACTIVE', userId: 3 },
    { congregationId: 1, firstName: 'Marta', lastName: 'Castillo', secondLastName: 'Ruiz', sex: 'FEMALE', status: 'ACTIVE', userId: 4 },
    { congregationId: 1, firstName: 'Jorge', lastName: 'Ramírez', secondLastName: 'Salazar', sex: 'MALE', status: 'ACTIVE', userId: 5 },
    { congregationId: 1, firstName: 'Ana María', lastName: 'Rojas', secondLastName: 'Díaz', sex: 'FEMALE', status: 'ACTIVE' },
    // Referenced by the duplicate-detection demo application.
    { congregationId: 2, firstName: 'Carlos', lastName: 'Pérez', secondLastName: 'Gómez', sex: 'MALE', status: 'ACTIVE' },
  ];
  const distribution: Array<[number, number]> = [[1, 22], [2, 12], [3, 8], [4, 5], [5, 3]];
  let n = 0;
  for (const [congregationId, count] of distribution) {
    for (let i = 0; i < count; i++, n++) {
      const female = n % 2 === 0;
      const names = female ? FEMALE_NAMES : MALE_NAMES;
      const status: MemberStatus = n % 17 === 5 ? 'INACTIVE' : n === 11 ? 'TRANSFERRED' : 'ACTIVE';
      seeds.push({
        congregationId,
        firstName: names[(n * 7) % names.length],
        lastName: LAST_NAMES[(n * 5 + 3) % LAST_NAMES.length],
        secondLastName: LAST_NAMES[(n * 11 + 1) % LAST_NAMES.length],
        sex: female ? 'FEMALE' : 'MALE',
        status,
      });
    }
  }
  return seeds;
}

const CONGREGATION_DENOMINATION = new Map(CONGREGATIONS.map((c) => [c.id, c.denominationId]));
const PEOPLE_SEEDS = generatePeople();

export const PERSONS: Person[] = PEOPLE_SEEDS.map((seed, index) => {
  const id = index + 1;
  const year = 1950 + ((index * 13) % 56);
  const month = String(((index * 5) % 12) + 1).padStart(2, '0');
  const day = String(((index * 7) % 27) + 1).padStart(2, '0');
  const isMinor = year > 2008;
  return {
    id,
    denominationId: CONGREGATION_DENOMINATION.get(seed.congregationId) ?? 1,
    userId: seed.userId ?? null,
    documentTypeCode: isMinor ? 'TI' : 'CC',
    documentNumber: id === 5 ? '1023456789' : String(isMinor ? 1100000000 + id * 7919 : 52000000 + id * 104729),
    firstName: seed.firstName,
    lastName: seed.lastName,
    secondLastName: seed.secondLastName,
    sex: seed.sex,
    birthDate: `${year}-${month}-${day}`,
    maritalStatusCode: isMinor ? 'SINGLE' : ['MARRIED', 'SINGLE', 'MARRIED', 'WIDOWED', 'COMMON_LAW'][index % 5],
    educationLevelCode: ['SECONDARY', 'UNIVERSITY', 'TECHNICAL', 'PRIMARY', 'POSTGRADUATE'][index % 5],
    profession: null,
    occupation: isMinor ? 'Estudiante' : OCCUPATIONS[index % OCCUPATIONS.length],
    phone: `300 555 ${String(1000 + id).slice(-4)}`,
    email: `persona${id}@correo.example`,
    address: `Calle ${10 + (id % 90)} # ${id % 40}-${(id * 3) % 99}`,
    municipalityCode: seed.congregationId === 3 ? '25754' : seed.congregationId === 5 ? '05001' : '11001',
  };
});

/** Children of Sede Central families: persons without membership (dedications, guardians). */
const MINORS: ReadonlyArray<Pick<Person, 'firstName' | 'lastName' | 'secondLastName' | 'sex' | 'birthDate'>> = [
  { firstName: 'Sara Valentina', lastName: 'Rojas', secondLastName: 'Pérez', sex: 'FEMALE', birthDate: '2015-04-18' },
  { firstName: 'Tomás', lastName: 'Herrera', secondLastName: 'Castillo', sex: 'MALE', birthDate: '2019-09-02' },
  { firstName: 'Isabella', lastName: 'Ramírez', secondLastName: 'Gómez', sex: 'FEMALE', birthDate: '2023-01-25' },
  { firstName: 'Emiliano', lastName: 'Rojas', secondLastName: 'Pérez', sex: 'MALE', birthDate: '2025-07-11' },
];

PERSONS.push(
  ...MINORS.map((minor, index): Person => {
    const id = PEOPLE_SEEDS.length + index + 1;
    return {
      ...minor,
      id,
      denominationId: 1,
      userId: null,
      documentTypeCode: minor.birthDate! < '2019-11-02' ? 'TI' : 'RC',
      documentNumber: String(1100100000 + id * 7919),
      maritalStatusCode: 'SINGLE',
      educationLevelCode: null,
      profession: null,
      occupation: null,
      phone: null,
      email: null,
      address: 'Calle 45 # 12-30',
      municipalityCode: '11001',
    };
  }),
);

export const MEMBERS: Member[] = PEOPLE_SEEDS.map((seed, index) => ({
  id: index + 1,
  denominationId: CONGREGATION_DENOMINATION.get(seed.congregationId) ?? 1,
  personId: index + 1,
  congregationId: seed.congregationId,
  status: seed.status,
  joinedOn: `${2005 + (index % 21)}-${String((index % 12) + 1).padStart(2, '0')}-10`,
  isBaptized: index % 6 !== 4,
  waterBaptismOn: index % 6 !== 4 ? `${2006 + (index % 20)}-04-12` : null,
  previousCongregationName: index === 3 ? 'Sede Norte' : null,
}));

/** First member number of each congregation, so codes look like an existing book (SC-0130). */
const FIRST_NUMBER: Readonly<Record<number, number>> = { 1: 127, 2: 64, 3: 21, 4: 40, 5: 12 };

export const MEMBER_REGISTRY_ENTRIES: MemberRegistryEntry[] = (() => {
  const next = new Map(Object.entries(FIRST_NUMBER).map(([k, v]) => [Number(k), v]));
  const entries: MemberRegistryEntry[] = [];
  // Ana María Rojas (member 4) came from Sede Norte: her closed entry there keeps the history.
  entries.push({ id: 1, denominationId: 1, memberId: 4, congregationId: 2, memberNumber: 51, registryBook: '2', registryFolio: '14', startedOn: '2012-03-04', endedOn: '2019-06-30' });
  for (const member of MEMBERS) {
    const number = next.get(member.congregationId) ?? 1;
    next.set(member.congregationId, number + 1);
    entries.push({
      id: entries.length + 1,
      denominationId: member.denominationId,
      memberId: member.id,
      congregationId: member.congregationId,
      memberNumber: number,
      registryBook: String(1 + Math.floor(number / 100)),
      registryFolio: String((number % 100) + 1),
      startedOn: member.id === 4 ? '2019-07-01' : (member.joinedOn ?? '2020-01-01'),
      // A member transferred to an external church keeps the closed entry as history.
      endedOn: member.status === 'TRANSFERRED' ? '2026-06-30' : null,
    });
  }
  return entries;
})();

/** Every seeded member authorized the first policy of their denomination on paper. */
export const DATA_CONSENTS: DataConsent[] = MEMBERS.map((member) => ({
  id: member.id,
  denominationId: member.denominationId,
  personId: member.personId,
  guardianId: null,
  policyId: member.denominationId === 2 ? 2 : 1,
  channel: 'PAPER',
  grantedAt: `${member.joinedOn ?? '2020-01-10'}T15:00:00Z`,
  revokedAt: null,
}));

function application(
  partial: Pick<MembershipApplication, 'id' | 'congregationId' | 'status' | 'firstName' | 'lastName' | 'documentTypeCode' | 'documentNumber' | 'birthDate' | 'createdAt' | 'trackingCode'> &
    Partial<MembershipApplication>,
): MembershipApplication {
  const denominationId = CONGREGATION_DENOMINATION.get(partial.congregationId) ?? 1;
  return {
    denominationId,
    policyId: denominationId === 2 ? 2 : 1,
    email: `${partial.firstName.toLowerCase().split(' ')[0]}.solicitud@correo.example`,
    phone: '310 555 0199',
    guardianName: null,
    guardianDocument: null,
    formData: { secondLastName: null, sex: null, maritalStatusCode: 'SINGLE', address: 'Carrera 30 # 45-12', municipalityCode: '11001', guardianRelationship: null, guardianPhone: null, previousCongregationName: null },
    consentedAt: partial.createdAt,
    reviewerId: null,
    reviewedAt: null,
    rejectionReason: null,
    matchedPersonId: null,
    memberId: null,
    ...partial,
  };
}

export const MEMBERSHIP_APPLICATIONS: MembershipApplication[] = [
  application({ id: 1, congregationId: 1, status: 'PENDING', firstName: 'Valentina', lastName: 'Suárez Medina', documentTypeCode: 'CC', documentNumber: '1019876543', birthDate: '1998-02-14', createdAt: '2026-10-30T15:20:00Z', trackingCode: 'MS-4H8J-21KD', formData: { secondLastName: null, sex: 'FEMALE', maritalStatusCode: 'SINGLE', address: 'Calle 63 # 24-18', municipalityCode: '11001', guardianRelationship: null, guardianPhone: null, previousCongregationName: null } }),
  application({ id: 2, congregationId: 1, status: 'PENDING', firstName: 'Samuel', lastName: 'Ortiz Cárdenas', documentTypeCode: 'TI', documentNumber: '1101234567', birthDate: '2011-08-03', createdAt: '2026-10-31T19:05:00Z', trackingCode: 'MS-9P2L-66TA', guardianName: 'Gloria Cárdenas Ríos', guardianDocument: 'CC 52345678', formData: { secondLastName: null, sex: 'MALE', maritalStatusCode: 'SINGLE', address: 'Carrera 50 # 3-21', municipalityCode: '11001', guardianRelationship: 'Madre', guardianPhone: '311 555 0144', previousCongregationName: null } }),
  application({ id: 3, congregationId: 1, status: 'PENDING', firstName: 'Carlos', lastName: 'Pérez Gómez', documentTypeCode: 'CC', documentNumber: '1023456789', birthDate: '1985-05-21', createdAt: '2026-11-01T13:40:00Z', trackingCode: 'MS-3D5F-10QW', formData: { secondLastName: null, sex: 'MALE', maritalStatusCode: 'MARRIED', address: 'Calle 147 # 19-40', municipalityCode: '11001', guardianRelationship: null, guardianPhone: null, previousCongregationName: 'Sede Norte' } }),
  application({ id: 4, congregationId: 1, status: 'IN_REVIEW', firstName: 'Natalia', lastName: 'Vargas Ríos', documentTypeCode: 'CC', documentNumber: '1032109876', birthDate: '1993-11-09', createdAt: '2026-10-27T21:15:00Z', trackingCode: 'MS-7F3K-92QD', reviewerId: 4, formData: { secondLastName: null, sex: 'FEMALE', maritalStatusCode: 'MARRIED', address: 'Diagonal 40 # 15-60', municipalityCode: '11001', guardianRelationship: null, guardianPhone: null, previousCongregationName: 'Iglesia Bautista El Redil' } }),
  application({ id: 5, congregationId: 1, status: 'PENDING', firstName: 'Felipe', lastName: 'Moreno Castro', documentTypeCode: 'CE', documentNumber: '845221', birthDate: '1990-01-30', createdAt: '2026-11-02T10:10:00Z', trackingCode: 'MS-2A7C-55RM' }),
  application({ id: 6, congregationId: 1, status: 'PENDING', firstName: 'Lucía', lastName: 'Medina Torres', documentTypeCode: 'CC', documentNumber: '1014567890', birthDate: '1979-07-17', createdAt: '2026-11-02T11:45:00Z', trackingCode: 'MS-8B1N-47XZ' }),
  application({ id: 7, congregationId: 1, status: 'APPROVED', firstName: 'Ana María', lastName: 'Rojas Díaz', documentTypeCode: 'CC', documentNumber: String(52000000 + 4 * 104729), birthDate: '1989-06-22', createdAt: '2026-09-12T14:00:00Z', trackingCode: 'MS-1K9D-30PL', reviewerId: 4, reviewedAt: '2026-09-15T16:00:00Z', memberId: 4 }),
  application({ id: 8, congregationId: 1, status: 'REJECTED', firstName: 'Prueba', lastName: 'Formulario Duplicado', documentTypeCode: 'CC', documentNumber: '1000000001', birthDate: '2000-01-01', createdAt: '2026-10-05T09:30:00Z', trackingCode: 'MS-5Z0X-88JJ', reviewerId: 4, reviewedAt: '2026-10-06T15:00:00Z', rejectionReason: 'Datos de prueba enviados por error' }),
  application({ id: 9, congregationId: 2, status: 'PENDING', firstName: 'Héctor', lastName: 'Salazar Muñoz', documentTypeCode: 'CC', documentNumber: '79456123', birthDate: '1970-12-02', createdAt: '2026-10-29T17:50:00Z', trackingCode: 'MS-6Y4T-12BV' }),
  application({ id: 10, congregationId: 2, status: 'PENDING', firstName: 'Mariana', lastName: 'Gil Ortiz', documentTypeCode: 'CC', documentNumber: '1020304050', birthDate: '2001-03-27', createdAt: '2026-11-01T20:30:00Z', trackingCode: 'MS-0C6V-73NS' }),
  application({ id: 11, congregationId: 4, status: 'PENDING', firstName: 'Julián', lastName: 'Ríos Mejía', documentTypeCode: 'CC', documentNumber: '80123987', birthDate: '1988-09-14', createdAt: '2026-10-25T18:00:00Z', trackingCode: 'VN-3R8E-41GH' }),
];

export const AUDIT_LOGS: AuditLogEntry[] = [
  { id: 1, userId: 1, denominationId: 1, congregationId: null, entity: 'Denomination', entityId: '1', action: 'CREATE', changes: { isActive: { from: null, to: true } }, ipAddress: '181.52.10.24', createdAt: '2026-01-15T14:00:00Z' },
  { id: 2, userId: 1, denominationId: 1, congregationId: null, entity: 'UserRole', entityId: '2', action: 'ROLE_GRANTED', changes: { role: { from: null, to: 'DENOMINATION_ADMIN' } }, ipAddress: '181.52.10.24', createdAt: '2026-01-15T14:10:00Z' },
  { id: 3, userId: 2, denominationId: 1, congregationId: 1, entity: 'Congregation', entityId: '1', action: 'CREATE', changes: { acceptsApplications: { from: null, to: true } }, ipAddress: '186.30.77.12', createdAt: '2026-01-16T14:30:00Z' },
  { id: 4, userId: 1, denominationId: 1, congregationId: 1, entity: 'UserRole', entityId: '10', action: 'ROLE_REVOKED', changes: { revokedAt: { from: null, to: '2026-04-30' } }, ipAddress: '181.52.10.24', createdAt: '2026-04-30T17:00:00Z' },
  { id: 5, userId: 4, denominationId: 1, congregationId: 1, entity: 'MembershipApplication', entityId: '7', action: 'APPLICATION_APPROVED', changes: { status: { from: 'PENDING', to: 'APPROVED' } }, ipAddress: '190.24.8.101', createdAt: '2026-09-15T16:00:00Z' },
  { id: 6, userId: 4, denominationId: 1, congregationId: 1, entity: 'MembershipApplication', entityId: '8', action: 'APPLICATION_REJECTED', changes: { status: { from: 'PENDING', to: 'REJECTED' } }, ipAddress: '190.24.8.101', createdAt: '2026-10-06T15:00:00Z' },
  { id: 7, userId: 4, denominationId: 1, congregationId: 1, entity: 'Certificate', entityId: '31', action: 'CERTIFICATE_ISSUED', changes: { number: { from: null, to: 'CERT-MEM-2026-0031' } }, ipAddress: '190.24.8.101', createdAt: '2026-10-28T15:30:00Z' },
  { id: 8, userId: 5, denominationId: 1, congregationId: 1, entity: 'Contribution', entityId: '18', action: 'CONTRIBUTION_VOIDED', changes: { status: { from: 'RECORDED', to: 'VOIDED' }, amount: { from: 150000, to: 150000 } }, ipAddress: '186.84.3.55', createdAt: '2026-10-29T20:10:00Z' },
  { id: 9, userId: 5, denominationId: 1, congregationId: 1, entity: 'AccountingPeriod', entityId: '10', action: 'PERIOD_CLOSED', changes: { status: { from: 'OPEN', to: 'CLOSED' } }, ipAddress: '186.84.3.55', createdAt: '2026-11-01T14:00:00Z' },
  { id: 10, userId: 3, denominationId: 1, congregationId: 1, entity: 'User', entityId: '3', action: 'LOGIN', changes: null, ipAddress: '181.49.2.17', createdAt: '2026-11-02T11:15:00Z' },
  { id: 11, userId: 4, denominationId: 1, congregationId: 1, entity: 'User', entityId: '4', action: 'LOGIN', changes: null, ipAddress: '190.24.8.101', createdAt: '2026-11-02T12:30:00Z' },
  { id: 12, userId: 8, denominationId: 2, congregationId: 4, entity: 'Congregation', entityId: '4', action: 'UPDATE', changes: { acceptsApplications: { from: false, to: true } }, ipAddress: '201.244.5.9', createdAt: '2026-10-20T13:00:00Z' },
];
