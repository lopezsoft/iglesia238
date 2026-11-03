import { ApplicationDetail, ApplicationQueue, ApplicationSummary, PersonMatch } from '../data/applications.models';

export function buildDetail(overrides: Partial<ApplicationDetail> = {}): ApplicationDetail {
  return {
    id: 7,
    congregationId: 10,
    congregationName: 'Sede Central',
    status: 'PENDING',
    documentTypeCode: 'CC',
    documentTypeName: 'Cédula de ciudadanía',
    documentNumber: '1023456789',
    firstName: 'Ana',
    lastName: 'Pérez',
    fullName: 'Ana Pérez Gómez',
    email: 'ana@example.com',
    phone: '3001234567',
    birthDate: '1990-05-20',
    age: 36,
    isMinor: false,
    guardianName: null,
    guardianDocument: null,
    formData: {
      secondLastName: 'Gómez',
      sex: 'FEMALE',
      maritalStatusCode: 'SINGLE',
      maritalStatusName: 'Soltero(a)',
      address: 'Calle 1 # 2-3',
      municipalityCode: '13001',
      municipalityName: 'Cartagena',
      regionName: 'Bolívar',
      neighborhood: 'Centro',
      occupation: 'Docente',
      previousCongregationName: null,
      isBaptized: true,
      guardianRelationship: null,
      guardianPhone: null,
      guardianDocumentTypeCode: null,
    },
    policyVersion: '1.0',
    consentedAt: '2026-11-01T10:00:00.000Z',
    createdAt: '2026-11-01T10:00:00.000Z',
    reviewerName: null,
    reviewedAt: null,
    rejectionReason: null,
    duplicateMatch: null,
    linkedPerson: null,
    memberId: null,
    memberCode: null,
    ...overrides,
  };
}

export function buildMatch(overrides: Partial<PersonMatch> = {}): PersonMatch {
  return {
    personId: 50,
    fullName: 'Ana Pérez Gómez',
    documentTypeCode: 'CC',
    documentNumber: '1023456789',
    congregationName: null,
    memberId: null,
    memberCode: null,
    memberStatus: null,
    ...overrides,
  };
}

export function buildSummary(overrides: Partial<ApplicationSummary> = {}): ApplicationSummary {
  return {
    id: 7,
    congregationId: 10,
    congregationName: 'Sede Central',
    status: 'PENDING',
    fullName: 'Ana Pérez Gómez',
    documentTypeCode: 'CC',
    documentNumber: '1023456789',
    createdAt: '2026-11-01T10:00:00.000Z',
    isMinor: false,
    hasDuplicateMatch: false,
    ...overrides,
  };
}

export function buildQueue(items: readonly ApplicationSummary[] = [buildSummary()]): ApplicationQueue {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 10,
    counts: { PENDING: items.length, DUPLICATE: 0, APPROVED: 2, REJECTED: 1, ALL: items.length + 3 },
  };
}
