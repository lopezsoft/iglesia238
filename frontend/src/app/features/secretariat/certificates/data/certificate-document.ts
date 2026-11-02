// Pure rules of the printed documents, shared by the data source (the snapshot it stores) and the
// live preview of the issue form, so both always print the same text.
import { CertificateSnapshot, Letterhead, MemberOption, Signers } from './certificates.models';

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
];

const TITLES: Readonly<Record<string, string>> = {
  MEM: 'Certificado de membresía',
  TRA: 'Carta de traslado',
  BAU: 'Certificado de bautismo',
  ASI: 'Constancia de asistencia',
};

/** Series of a certificate type in a year: the DocumentSequence key. */
export function certificateSeriesKey(typeCode: string, year: number): string {
  return `CERT-${typeCode}-${year}`;
}

/** CERT-<CODE>-<YEAR>-<NNNN>. */
export function certificateNumber(typeCode: string, year: number, sequenceNumber: number): string {
  return `${certificateSeriesKey(typeCode, year)}-${String(sequenceNumber).padStart(4, '0')}`;
}

/** "2 de noviembre de 2026" from an ISO date (YYYY-MM-DD). */
export function longDate(isoDate: string): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  return `${day} de ${MONTHS[month - 1]} de ${year}`;
}

/** ISO date plus whole years; 29 February falls on 28 February in common years. */
export function addYears(isoDate: string, years: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const targetYear = year + years;
  const lastDay = new Date(Date.UTC(targetYear, month, 0)).getUTCDate();
  return isoDateOf(targetYear, month, Math.min(day, lastDay));
}

export function addDays(isoDate: string, days: number): string {
  const [year, month, day] = isoDate.slice(0, 10).split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return isoDateOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  const toUtc = (iso: string): number => {
    const [year, month, day] = iso.slice(0, 10).split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

export function isoDateOf(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Local calendar date of the browser as YYYY-MM-DD. */
export function localIsoDate(date: Date = new Date()): string {
  return isoDateOf(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/** "CC 52.418.916": digits grouped like the printed documents. */
export function documentLabel(typeCode: string | null, documentNumber: string | null): string {
  if (!documentNumber) {
    return '';
  }
  const formatted = /^\d+$/.test(documentNumber)
    ? documentNumber.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
    : documentNumber;
  return typeCode ? `${typeCode} ${formatted}` : formatted;
}

export function certificateTitle(typeCode: string, typeName: string): string {
  return (TITLES[typeCode] ?? typeName).toUpperCase();
}

export interface CertificateDocumentInput {
  readonly number: string;
  readonly typeCode: string;
  readonly typeName: string;
  readonly issuedOn: string;
  readonly letterhead: Letterhead;
  readonly signers: Signers;
  readonly issuedByName: string;
  readonly member: MemberOption;
  readonly notes: string | null;
}

/** Builds the printed text. The result is stored as the certificate snapshot. */
export function buildCertificateSnapshot(input: CertificateDocumentInput): CertificateSnapshot {
  const { letterhead, member } = input;
  const sede = sedeReference(letterhead.congregationName);
  const notes = input.notes?.trim() || null;
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
    body: certificateBody(input.typeCode, member, sede),
    notes,
    closing: `Se expide en ${letterhead.cityName}, el ${longDate(input.issuedOn)}, a solicitud del interesado(a).`,
    pastorName: input.signers.pastorName ?? 'Pastor(a) de la sede',
    pastorTitle: `Pastor(a), ${letterhead.congregationName}`,
    secretaryName: input.signers.secretaryName,
    secretaryTitle: `Secretario(a), ${letterhead.congregationName}`,
    issuedByName: input.issuedByName,
    memberName: member.fullName,
    memberCode: member.code,
  };
}

function certificateBody(typeCode: string, member: MemberOption, sede: string): string {
  const who = member.documentLabel
    ? `${member.fullName}, identificado(a) con ${member.documentLabel},`
    : `${member.fullName},`;
  const since = member.joinedOn ? ` desde el ${longDate(member.joinedOn)}` : '';
  switch (typeCode) {
    case 'TRA':
      return (
        `Por medio de la presente, ${sede} presenta a ${who} miembro de esta congregación${since} ` +
        `con código ${member.code}, quien solicita su traslado. Damos testimonio de su buena conducta ` +
        'cristiana y pedimos que sea recibido(a) en la congregación de destino.'
      );
    case 'BAU': {
      const on = member.waterBaptismOn ? ` el ${longDate(member.waterBaptismOn)}` : '';
      return (
        `Se certifica que ${who} recibió el bautismo en agua${on}, según consta en el registro de ` +
        `membresía ${member.code} de ${sede}.`
      );
    }
    case 'ASI':
      return (
        `Se hace constar que ${who} miembro de esta congregación con código ${member.code}, ` +
        `asiste regularmente a las reuniones de ${sede}.`
      );
    default:
      return (
        `Se certifica que ${who} es miembro activo(a) de esta congregación${since}, inscrito(a) con ` +
        `el código ${member.code}, y se encuentra en plena comunión con la iglesia.`
      );
  }
}

/** "la Sede Central" or "la sede Vida Nueva Chapinero". */
export function sedeReference(congregationName: string): string {
  return /^sede\b/i.test(congregationName)
    ? `la ${congregationName}`
    : `la sede ${congregationName}`;
}
