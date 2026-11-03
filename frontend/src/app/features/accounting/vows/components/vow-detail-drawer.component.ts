import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  CONTRIBUTION_STATUS_LABELS,
  PAYMENT_METHOD_LABELS,
  VOW_PLEDGE_STATUS_LABELS,
} from '../../data/accounting.models';
import { VowPledgeDetail } from '../data/vows.models';
import { VowsRepository } from '../data/vows.repository';
import { VOW_STATUS_TONES } from '../vow-status';

/** Side drawer with the pledge, its payments and the actions: register a payment, edit, cancel. */
@Component({
  selector: 'app-vow-detail-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, ErrorBannerComponent, IconComponent, LoadingComponent, MoneyPipe, RouterLink, StatusBadgeComponent],
  template: `
    <app-dialog [(open)]="open" variant="drawer" [title]="data()?.code ?? 'Promesa de voto'">
      @if (detail.error()) {
        <app-error-banner [message]="errorMessage()" (retry)="detail.reload()" />
      } @else if (detail.isLoading() || !data()) {
        <app-loading label="Cargando la promesa…" />
      } @else {
        @let pledge = data()!;
        <div class="stack">
          <div>
            <h3>{{ pledge.personName }}</h3>
            <p class="text-muted text-small">
              {{ pledge.documentHint }} · <span class="mono">{{ pledge.memberCode }}</span> · {{ pledge.congregationName }}
            </p>
          </div>

          <div class="amounts">
            <div>
              <span class="text-muted text-small">Prometido</span>
              <span class="amount">{{ pledge.pledgedAmount | money }}</span>
            </div>
            <div>
              <span class="text-muted text-small">Abonado</span>
              <span class="amount">{{ pledge.paid | money }}</span>
            </div>
            <div>
              <span class="text-muted text-small">Saldo</span>
              <span class="amount">{{ pledge.balance | money }}</span>
            </div>
          </div>

          <div class="stack progress-block">
            <div class="cluster progress-label">
              <span class="text-small">{{ pledge.progress }} % abonado</span>
              <span class="cluster">
                @if (pledge.isOverdue) {
                  <span class="badge badge--danger">Vencida</span>
                }
                <app-status-badge [label]="statusLabels[pledge.status]" [tone]="statusTones[pledge.status]" />
              </span>
            </div>
            <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="pledge.progress" aria-label="Avance de la promesa">
              <div class="progress__bar" [class.progress__bar--success]="pledge.status === 'FULFILLED'" [style.width.%]="pledge.progress"></div>
            </div>
          </div>

          <dl class="details">
            <div><dt>Tipo de aporte</dt><dd>{{ pledge.typeName }}</dd></div>
            <div><dt>Fecha de promesa</dt><dd>{{ pledge.pledgedOn | date: 'dd/MM/yyyy' }}</dd></div>
            <div><dt>Fecha límite</dt><dd>{{ pledge.dueOn ? (pledge.dueOn | date: 'dd/MM/yyyy') : 'Sin fecha límite' }}</dd></div>
            <div><dt>Fondo</dt><dd>{{ pledge.fundName }}</dd></div>
            <div><dt>Último abono</dt><dd>{{ pledge.lastPaymentOn ? (pledge.lastPaymentOn | date: 'dd/MM/yyyy') : 'Sin abonos' }}</dd></div>
            <div><dt>Observaciones</dt><dd>{{ pledge.description ?? '—' }}</dd></div>
          </dl>

          @if (pledge.status === 'CANCELLED') {
            <div class="alert" role="note">
              <app-icon name="ban" />
              <span>Promesa cancelada. Motivo: {{ pledge.cancelReason ?? 'no registrado' }}. Sus abonos se conservan.</span>
            </div>
          }

          <section aria-labelledby="payments-title">
            <h3 id="payments-title">Abonos <span class="text-muted">({{ pledge.paymentCount }})</span></h3>
            @if (pledge.payments.length > 0) {
              <div class="table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Recibo</th>
                      <th scope="col">Medio</th>
                      <th scope="col" class="text-right">Valor</th>
                      <th scope="col">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (payment of pledge.payments; track payment.id) {
                      <tr>
                        <td>{{ payment.receivedOn | date: 'dd/MM/yyyy' }}</td>
                        <td class="code">{{ payment.receiptNumber }}</td>
                        <td>
                          {{ methodLabels[payment.paymentMethod] }}
                          <div class="text-muted text-small">{{ payment.congregationName }}</div>
                        </td>
                        <td class="num" [class.voided]="payment.status === 'VOIDED'">{{ payment.amount | money }}</td>
                        <td>{{ contributionStatusLabels[payment.status] }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            } @else {
              <p class="text-muted">Aún no hay abonos registrados para esta promesa.</p>
            }
          </section>

          <div class="alert" role="note">
            <app-icon name="info" />
            <span>
              <strong>Regla de abonos.</strong> Solo se aceptan abonos de la misma persona y del mismo tipo de aporte. Un abono
              nunca puede superar el saldo pendiente.
            </span>
          </div>
        </div>
      }
      <div dialog-footer class="cluster">
        @if (data(); as pledge) {
          @if (pledge.status === 'FULFILLED') {
            <span class="text-muted text-small">Promesa cumplida: no admite más abonos.</span>
          }
          @if (canWrite() && pledge.status !== 'CANCELLED') {
            <button type="button" class="btn btn--secondary" (click)="editRequested.emit(pledge)">
              <app-icon name="edit" [size]="16" />
              Editar
            </button>
          }
          @if (canWrite() && pledge.status === 'ACTIVE') {
            <button type="button" class="btn btn--danger-ghost" (click)="cancelRequested.emit(pledge)">Cancelar promesa</button>
          }
        }
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cerrar</button>
        @if (canWrite() && data()?.status === 'ACTIVE') {
          <a class="btn btn--primary" routerLink="/accounting/contributions" [queryParams]="{ vowPledgeId: pledgeId() }">
            <app-icon name="plus" />
            Registrar abono
          </a>
        }
      </div>
    </app-dialog>
  `,
  styles: `
    @use 'tokens' as *;
    .amounts {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: $space-3;

      > div {
        display: flex;
        flex-direction: column;
        gap: $space-1;
        padding: $space-3;
        border-radius: $radius-control;
        background: $color-surface-2;
      }
    }
    .progress-block {
      gap: $space-2;
    }
    .progress-label {
      justify-content: space-between;
    }
    .voided {
      text-decoration: line-through;
      color: $color-ink-muted;
    }
  `,
})
export class VowDetailDrawerComponent {
  private readonly repository = inject(VowsRepository);

  readonly open = model(false);
  readonly pledgeId = input<number | null>(null);
  readonly canWrite = input(false);
  /** Bump to re-read the pledge after the page changed it. */
  readonly refresh = input(0);
  readonly editRequested = output<VowPledgeDetail>();
  readonly cancelRequested = output<VowPledgeDetail>();

  protected readonly statusLabels = VOW_PLEDGE_STATUS_LABELS;
  protected readonly statusTones = VOW_STATUS_TONES;
  protected readonly contributionStatusLabels = CONTRIBUTION_STATUS_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;

  protected readonly detail = rxResource({
    params: () => {
      const id = this.pledgeId();
      return this.open() && id !== null ? { id, refresh: this.refresh() } : undefined;
    },
    stream: ({ params }) => this.repository.detail(params.id),
  });

  /** `value()` throws while a resource is in error, so the template reads this instead. */
  protected readonly data = computed(() => (this.detail.hasValue() ? this.detail.value() : undefined));

  protected errorMessage(): string {
    return userMessage(this.detail.error());
  }
}
