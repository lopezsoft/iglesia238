// Pure rules of the printed documents. The text stored as a certificate snapshot is built here, so the
// preview, the issued document and the PDF always print the same thing.

const MONTHS = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
] as const;

const DEFAULT_TITLES: Readonly<Record<string, string>> = {
  MEM: 'Certificado de membresía',
  TRA: 'Carta de traslado',
  BAU: 'Certificado de bautismo',
  ASI: 'Constancia de asistencia',
};

/** What is printed on the certificate. It never changes once issued. */
export interface CertificateSnapshot {
  readonly number: string;
  readonly typeCode: string;
  readonly title: string;
  readonly denominationName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly congregationName: string;
  readonly locationLine: string;
  readonly intro: string;
  readonly body: string;
  readonly notes: string | null;
  readonly closing: string;
  readonly pastorName: string;
  readonly pastorTitle: string;
  readonly secretaryName: string | null;
  readonly secretaryTitle: string;
  readonly issuedByName: string;
  readonly memberName: string;
  readonly memberCode: string;
}

export interface Letterhead {
  readonly denominationName: string;
  readonly legalName: string;
  readonly taxId: string;
  readonly congregationName: string;
  readonly cityName: string;
  readonly locationLine: string;
}

export interface SnapshotMember {
  readonly fullName: string;
  readonly code: string;
  /** "CC 52.418.916": the full document, printed on the certificate. */
  readonly documentLabel: string;
  readonly joinedOn: string | null;
  readonly waterBaptismOn: string | null;
}

export interface SnapshotInput {
  readonly number: string;
  readonly typeCode: string;
  readonly typeName: string;
  /** Text of CertificateType.template, when the denomination customized it. */
  readonly template: string | null;
  readonly issuedOn: string;
  readonly letterhead: Letterhead;
  readonly pastorName: string | null;
  readonly secretaryName: string | null;
  readonly issuedByName: string;
  readonly member: SnapshotMember;
  readonly notes: string | null;
}

/** "2 de noviembre de 2026" from an ISO date (YYYY-MM-DD). */
export function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

function isoDateOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return isoDateOf(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
  );
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const toUtc = (iso: string): number => {
    const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/** "CC 52.418.916": digits grouped like the printed documents. */
export function documentLabel(
  typeCode: string | null,
  documentNumber: string | null,
): string {
  if (!documentNumber) {
    return '';
  }
  const formatted = /^\d+$/.test(documentNumber)
    ? documentNumber.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : documentNumber;
  return typeCode ? `${typeCode} ${formatted}` : formatted;
}

/** "CC ····8916": what lists and searches show. The full document only travels inside a certificate. */
export function maskedDocumentLabel(
  typeCode: string | null,
  documentNumber: string | null,
): string {
  if (!documentNumber) {
    return '';
  }
  const visible = documentNumber.length > 4 ? documentNumber.slice(-4) : '';
  const masked = `····${visible}`;
  return typeCode ? `${typeCode} ${masked}` : masked;
}

export function certificateTitle(typeCode: string, typeName: string): string {
  return (DEFAULT_TITLES[typeCode] ?? typeName).toUpperCase();
}

/** "la Sede Central" or "la sede Vida Nueva Chapinero". */
export function sedeReference(congregationName: string): string {
  return /^sede\b/i.test(congregationName)
    ? `la ${congregationName}`
    : `la sede ${congregationName}`;
}

/** Placeholders a denomination can use in CertificateType.template. */
export const TEMPLATE_PLACEHOLDERS = [
  'memberName',
  'document',
  'memberCode',
  'congregation',
  'sede',
  'joinedOn',
  'baptismDate',
] as const;

function renderTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_match, key: string) => values[key] ?? '')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function who(member: SnapshotMember): string {
  return member.documentLabel
    ? `${member.fullName}, identificado(a) con ${member.documentLabel},`
    : `${member.fullName},`;
}

function codePhrase(member: SnapshotMember): string {
  return member.code ? ` con código ${member.code}` : '';
}

function defaultBody(
  typeCode: string,
  member: SnapshotMember,
  sede: string,
): string {
  const subject = who(member);
  const since = member.joinedOn ? ` desde el ${longDate(member.joinedOn)}` : '';
  switch (typeCode) {
    case 'TRA':
      return (
        `Por medio de la presente, ${sede} presenta a ${subject} miembro de esta congregación${since}` +
        `${codePhrase(member)}, quien solicita su traslado. Damos testimonio de su buena conducta ` +
        'cristiana y pedimos que sea recibido(a) en la congregación de destino.'
      );
    case 'BAU': {
      const on = member.waterBaptismOn
        ? ` el ${longDate(member.waterBaptismOn)}`
        : '';
      const registry = member.code
        ? `, según consta en el registro de membresía ${member.code} de ${sede}`
        : `, según consta en el registro de ${sede}`;
      return `Se certifica que ${subject} recibió el bautismo en agua${on}${registry}.`;
    }
    case 'ASI':
      return (
        `Se hace constar que ${subject} miembro de esta congregación${codePhrase(member)}, ` +
        `asiste regularmente a las reuniones de ${sede}.`
      );
    default:
      return (
        `Se certifica que ${subject} es miembro activo(a) de esta congregación${since}` +
        `${member.code ? `, inscrito(a) con el código ${member.code}` : ''}, ` +
        'y se encuentra en plena comunión con la iglesia.'
      );
  }
}

/** Builds the printed text. The result is stored as `Certificate.snapshot`. */
export function buildCertificateSnapshot(
  input: SnapshotInput,
): CertificateSnapshot {
  const { letterhead, member } = input;
  const sede = sedeReference(letterhead.congregationName);
  const notes = input.notes?.trim() || null;
  const body =
    input.template && input.template.trim() !== ''
      ? renderTemplate(input.template, {
          memberName: member.fullName,
          document: member.documentLabel,
          memberCode: member.code,
          congregation: letterhead.congregationName,
          sede,
          joinedOn: member.joinedOn ? longDate(member.joinedOn) : '',
          baptismDate: member.waterBaptismOn
            ? longDate(member.waterBaptismOn)
            : '',
        })
      : defaultBody(input.typeCode, member, sede);
  const place = letterhead.cityName ? ` en ${letterhead.cityName}` : '';

  return {
    number: input.number,
    typeCode: input.typeCode,
    title: certificateTitle(input.typeCode, input.typeName),
    denominationName: letterhead.denominationName,
    legalName: letterhead.legalName,
    taxId: letterhead.taxId,
    congregationName: letterhead.congregationName,
    locationLine: letterhead.locationLine,
    intro: `La Secretaría de ${sede} hace constar`,
    body,
    notes,
    closing: `Se expide${place ? `${place},` : ''} el ${longDate(input.issuedOn)}, a solicitud del interesado(a).`,
    pastorName: input.pastorName ?? 'Pastor(a) de la sede',
    pastorTitle: `Pastor(a), ${letterhead.congregationName}`,
    secretaryName: input.secretaryName,
    secretaryTitle: `Secretario(a), ${letterhead.congregationName}`,
    issuedByName: input.issuedByName,
    memberName: member.fullName,
    memberCode: member.code,
  };
}
