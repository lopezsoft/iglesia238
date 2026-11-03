import { Inject, Injectable } from '@nestjs/common';
import {
  VOUCHER_TYPE_LIST,
  fromCents,
  toCents,
  type VoucherType,
} from '../../../common/accounting/accounting-rules.js';
import { AccountingPermissions } from '../../../common/accounting/accounting-permissions.js';
import { requireCongregationScope } from '../../../common/accounting/congregation-scope.js';
import {
  ForbiddenDomainException,
  InvalidInputException,
  NotFoundDomainException,
} from '../../../common/errors/domain.exception.js';
import { formatVoucherCode } from '../../../common/numbering/document-numbering.service.js';
import { isIsoDate } from '../../../common/mappers/value-mappers.js';
import { buildPage, type Page } from '../../../common/pagination/page.js';
import type { TenantContext } from '../../../common/tenancy/tenant-context.js';
import type {
  VoucherDetailView,
  VoucherListItemView,
} from './cash-book.views.js';
import {
  VOUCHER_READ_REPOSITORY,
  type VoucherDetailRecord,
  type VoucherReadRepository,
  type VoucherRecord,
} from './voucher.repository.js';

export interface VoucherListInput {
  readonly type?: string;
  readonly from?: string;
  readonly to?: string;
  readonly status?: 'ISSUED' | 'VOIDED';
  /** Consecutive number of the voucher. */
  readonly number?: number;
  /** Required for a denomination-wide session. */
  readonly congregationId?: number;
  readonly page: number;
  readonly pageSize: number;
}

const TYPE_LABELS: Readonly<Record<VoucherType, string>> = {
  REC: 'Recibo de aporte',
  CI: 'Comprobante de ingreso',
  CE: 'Comprobante de egreso',
  LD: 'Liquidación del diezmo',
};

/** Who may read each kind of voucher. */
const TYPE_PERMISSION: Readonly<Record<VoucherType, string>> = {
  REC: AccountingPermissions.contributionsRead,
  CI: AccountingPermissions.cashWrite,
  CE: AccountingPermissions.cashWrite,
  LD: AccountingPermissions.titheWrite,
};

/** Consultation of the vouchers (receipts, cash vouchers, settlements) of a sede. */
@Injectable()
export class VouchersService {
  constructor(
    @Inject(VOUCHER_READ_REPOSITORY)
    private readonly vouchers: VoucherReadRepository,
  ) {}

  async list(
    tenant: TenantContext,
    input: VoucherListInput,
  ): Promise<Page<VoucherListItemView>> {
    const scope = this.scopeOf(tenant, input.congregationId);
    const allowed = readableTypes(tenant);
    if (input.type !== undefined && !isVoucherType(input.type)) {
      throw new InvalidInputException(
        'El tipo de comprobante no es válido.',
        'INVALID_VOUCHER_TYPE',
      );
    }
    if (input.type !== undefined && !allowed.includes(input.type)) {
      throw new ForbiddenDomainException();
    }
    for (const date of [input.from, input.to]) {
      if (date !== undefined && !isIsoDate(date)) {
        throw new InvalidInputException(
          'La fecha no es válida.',
          'INVALID_DATE',
        );
      }
    }

    const { rows, total } = await this.vouchers.list(scope, {
      types: input.type === undefined ? allowed : [input.type],
      from: input.from,
      to: input.to,
      voided:
        input.status === undefined ? undefined : input.status === 'VOIDED',
      number: input.number,
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    });
    return buildPage(rows.map(toListItem), total, input);
  }

  async get(
    tenant: TenantContext,
    id: number,
    congregationId?: number,
  ): Promise<VoucherDetailView> {
    return toDetail(await this.getRecord(tenant, id, congregationId));
  }

  /** The voucher with everything needed to print it, under the same access rules as `get`. */
  async getRecord(
    tenant: TenantContext,
    id: number,
    congregationId?: number,
  ): Promise<VoucherDetailRecord> {
    const scope = this.scopeOf(tenant, congregationId);
    const record = await this.vouchers.find(scope, id);
    if (!record) {
      throw new NotFoundDomainException('El comprobante no existe.');
    }
    if (!readableTypes(tenant).includes(record.type as VoucherType)) {
      throw new ForbiddenDomainException();
    }
    return record;
  }

  private scopeOf(tenant: TenantContext, congregationId?: number) {
    if (tenant.congregationId !== null || congregationId !== undefined) {
      return tenant.congregationScope(congregationId);
    }
    return requireCongregationScope(tenant, 'consultar sus comprobantes');
  }
}

function isVoucherType(value: string): value is VoucherType {
  return (VOUCHER_TYPE_LIST as readonly string[]).includes(value);
}

function readableTypes(tenant: TenantContext): VoucherType[] {
  return VOUCHER_TYPE_LIST.filter((type) => tenant.has(TYPE_PERMISSION[type]));
}

function amountOf(record: VoucherRecord): number {
  if (record.linesCount > 0) {
    return record.linesAmount;
  }
  if (record.contributionsCount > 0) {
    return record.contributionsAmount;
  }
  return record.settlementGross ?? 0;
}

function toListItem(record: VoucherRecord): VoucherListItemView {
  const type = record.type;
  return {
    id: record.id,
    code: formatVoucherCode(type, record.issuedOn, record.number),
    type,
    typeLabel: isVoucherType(type) ? TYPE_LABELS[type] : type,
    number: record.number,
    issuedOn: record.issuedOn,
    amount: fromCents(toCents(amountOf(record))),
    status: record.voidedAt === null ? 'ISSUED' : 'VOIDED',
    voidReason: record.voidReason,
    movements: record.linesCount,
    contributions: record.contributionsCount,
  };
}

export function voucherTypeLabel(type: string): string {
  return isVoucherType(type) ? TYPE_LABELS[type] : type;
}

function toDetail(record: VoucherDetailRecord): VoucherDetailView {
  return {
    ...toListItem(record),
    lines: record.lines,
    // Only what the screen shows: the contributor stays out of the JSON detail.
    contributionRows: record.contributions.map((contribution) => ({
      id: contribution.id,
      receivedOn: contribution.receivedOn,
      typeName: contribution.typeName,
      amount: contribution.amount,
      status: contribution.status,
    })),
  };
}
