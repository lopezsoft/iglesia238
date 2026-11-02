import { Injectable, inject } from '@angular/core';
import { Observable, defer, map } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { DemoDatabase } from '../../../../core/demo/demo-database';
import { demoCommand, demoResponse } from '../../../../core/demo/demo-request';
import { DomainError } from '../../../../core/errors/domain-error';
import { AccountingDemoStore } from '../../data/accounting-demo-store';
import { contributionDisplayStatus, roundMoney, vowPledgeCode, vowPledgeStatusFor } from '../../data/accounting-rules';
import { AccountingTenant, inScope, requirePermission, writeTenant } from '../../data/accounting-tenant';
import { PersonOption, VowPledge } from '../../data/accounting.models';
import { CreateVowPledgeCommand, VowPledgeDetail, VowPledgeRow, VowsOverview } from './vows.models';
import { VowsRepository } from './vows.repository';

const READ = 'contributions.read';
const WRITE = 'contributions.write';
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Demo adapter of Votos: paid amounts and statuses are always computed from contributions. */
@Injectable()
export class DemoVowsRepository extends VowsRepository {
  private readonly auth = inject(AuthService);
  private readonly store = inject(AccountingDemoStore);
  private readonly db = inject(DemoDatabase);

  overview(): Observable<VowsOverview> {
    return this.read((tenant) => ({
      today: this.store.today,
      congregationScoped: tenant.congregationId !== null,
      scopeLabel: tenant.congregationId === null ? 'todas las sedes' : this.store.congregationName(tenant.congregationId),
      rows: this.store.vowPledges
        .filter((p) => inScope(tenant, p))
        .map((p) => this.toRow(p))
        .sort((a, b) => b.pledgedOn.localeCompare(a.pledgedOn) || b.id - a.id),
      vowTypes: this.store.contributionTypes
        .filter((t) => t.denominationId === tenant.denominationId && t.category === 'VOW' && t.isActive)
        .map((t) => ({ id: t.id, name: t.name })),
    }));
  }

  detail(pledgeId: number): Observable<VowPledgeDetail> {
    return this.read((tenant) => {
      const pledge = this.store.vowPledges.find((p) => p.id === pledgeId && inScope(tenant, p));
      if (!pledge) {
        throw new DomainError('NOT_FOUND', 'La promesa de voto no existe en la sede.');
      }
      const type = this.store.contributionType(tenant.denominationId, pledge.contributionTypeId);
      const account = type ? this.store.account(tenant.denominationId, type.accountId) : undefined;
      const fundId = account?.defaultFundId ?? null;
      const fund = fundId === null ? undefined : this.store.fund(tenant.denominationId, fundId);
      return {
        ...this.toRow(pledge),
        documentHint: this.store.personOption(tenant.denominationId, pledge.personId)?.documentHint ?? '—',
        fundName: fund?.name ?? '—',
        payments: this.store.contributions
          .filter((c) => c.vowPledgeId === pledge.id && c.denominationId === tenant.denominationId)
          .sort((a, b) => b.receivedOn.localeCompare(a.receivedOn) || b.id - a.id)
          .map((c) => ({
            id: c.id,
            receivedOn: c.receivedOn,
            receiptNumber: this.store.voucherCode(c.voucherId),
            amount: c.amount,
            paymentMethod: c.paymentMethod,
            status: contributionDisplayStatus(c),
            congregationName: this.store.congregationName(c.congregationId),
          })),
      };
    });
  }

  create(command: CreateVowPledgeCommand): Observable<VowPledgeRow> {
    return demoCommand(() => {
      const tenant = writeTenant(this.auth, WRITE, 'registrar promesas de voto');
      if (!this.store.personOption(tenant.denominationId, command.personId)) {
        throw new DomainError('PERSON_NOT_FOUND', 'La persona no pertenece a la denominación.');
      }
      const type = this.store.contributionType(tenant.denominationId, command.contributionTypeId);
      if (!type || type.category !== 'VOW' || !type.isActive) {
        throw new DomainError('VOW_TYPE_INVALID', 'El tipo de aporte debe ser un Voto activo.');
      }
      const amount = roundMoney(command.pledgedAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new DomainError('INVALID_AMOUNT', 'El valor prometido debe ser mayor que cero.');
      }
      if (!ISO_DATE.test(command.pledgedOn)) {
        throw new DomainError('INVALID_DATE', 'La fecha de la promesa no es válida.');
      }
      if (command.pledgedOn > this.store.today) {
        throw new DomainError('FUTURE_DATE', 'La fecha de la promesa no puede ser posterior a hoy.');
      }
      const description = command.description?.trim() || null;
      if ((description?.length ?? 0) > 255) {
        throw new DomainError('NOTES_TOO_LONG', 'Las observaciones admiten máximo 255 caracteres.');
      }
      const pledge: VowPledge = {
        id: this.store.nextId(this.store.vowPledges),
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        personId: command.personId,
        contributionTypeId: type.id,
        description,
        pledgedAmount: amount,
        pledgedOn: command.pledgedOn,
        dueOn: null,
        status: 'ACTIVE',
        createdAt: this.store.nowIso(),
      };
      this.store.vowPledges.push(pledge);
      this.db.audit({
        userId: tenant.userId,
        denominationId: tenant.denominationId,
        congregationId: tenant.congregationId,
        entity: 'VowPledge',
        entityId: String(pledge.id),
        action: 'VOW_PLEDGE_CREATED',
        changes: { status: { from: null, to: 'ACTIVE' }, pledgedAmount: { from: null, to: amount } },
      });
      return this.toRow(pledge);
    });
  }

  searchPersons(query: string): Observable<PersonOption[]> {
    return this.read((tenant) => this.store.searchPersons(tenant.denominationId, query, tenant.congregationId));
  }

  private toRow(pledge: VowPledge): VowPledgeRow {
    const payments = this.store.contributions.filter((c) => c.vowPledgeId === pledge.id && c.status !== 'VOIDED');
    const paid = this.store.vowPaid(pledge.id);
    const person = this.store.personOption(pledge.denominationId, pledge.personId);
    return {
      id: pledge.id,
      code: vowPledgeCode(pledge),
      personId: pledge.personId,
      personName: this.store.personName(pledge.personId) ?? '—',
      memberCode: person?.memberCode ?? '—',
      contributionTypeId: pledge.contributionTypeId,
      typeName: this.store.contributionTypes.find((t) => t.id === pledge.contributionTypeId)?.name ?? 'Voto',
      description: pledge.description,
      pledgedAmount: pledge.pledgedAmount,
      pledgedOn: pledge.pledgedOn,
      paid,
      balance: roundMoney(Math.max(0, pledge.pledgedAmount - paid)),
      progress: pledge.pledgedAmount > 0 ? Math.min(100, Math.round((paid / pledge.pledgedAmount) * 100)) : 0,
      status: vowPledgeStatusFor(pledge, paid),
      lastPaymentOn: payments.reduce<string | null>((last, c) => (last === null || c.receivedOn > last ? c.receivedOn : last), null),
      paymentCount: payments.length,
      congregationName: this.store.congregationName(pledge.congregationId),
    };
  }

  private read<T>(project: (tenant: AccountingTenant) => T): Observable<T> {
    return defer(() => demoResponse(requirePermission(this.auth, READ, 'consultar votos'))).pipe(
      map((tenant) => project(tenant)),
    );
  }
}
