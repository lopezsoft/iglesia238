import { Inject, Injectable } from '@nestjs/common';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import { readScope, toCertificateListItem } from '../certificate-mappers.js';
import type { CertificateFilter } from '../certificate.models.js';
import { restrictedFilter } from '../certificate-access.js';
import {
  CERTIFICATE_REPOSITORY,
  type CertificateRepository,
} from '../ports/certificate.repository.js';

export const EXPORT_MAX_ROWS = 5000;
const SEPARATOR = ';';
const BOM = '﻿';

const HEADERS = [
  'Número',
  'Tipo',
  'Sede',
  'Miembro',
  'Código de miembro',
  'Fecha de emisión',
  'Vence',
  'Emitido por',
  'Estado',
  'Motivo de anulación',
] as const;

/** Quotes a value and neutralizes spreadsheet formulas (a leading = + - @ would be executed by Excel). */
export function csvCell(value: string | number | null): string {
  let text = value === null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(text)) {
    text = `'${text}`;
  }
  return /["\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export interface CertificatesCsv {
  readonly filename: string;
  readonly content: string;
}

/** CSV (UTF-8 with BOM, ";" separator, like the Spanish locale of Excel expects) of the filtered list. */
@Injectable()
export class ExportCertificatesUseCase {
  constructor(
    @Inject(CERTIFICATE_REPOSITORY)
    private readonly certificates: CertificateRepository,
  ) {}

  async execute(
    tenant: TenantContext,
    filter: CertificateFilter,
    congregationId?: number,
  ): Promise<CertificatesCsv> {
    const scope = readScope(tenant, congregationId);
    const rows = await this.certificates.listForExport(
      scope,
      restrictedFilter(tenant, filter),
      EXPORT_MAX_ROWS,
    );
    const lines = rows.map((record) => {
      const item = toCertificateListItem(record);
      return [
        item.number,
        item.typeName,
        item.congregationName,
        item.memberName,
        item.memberCode,
        item.issuedOn,
        item.expiresOn,
        item.issuedByName,
        item.status === 'ISSUED' ? 'Vigente' : 'Anulado',
        item.voidReason,
      ]
        .map(csvCell)
        .join(SEPARATOR);
    });
    return {
      filename: 'certificados.csv',
      content: `${BOM}${[HEADERS.map(csvCell).join(SEPARATOR), ...lines].join('\r\n')}\r\n`,
    };
  }
}
