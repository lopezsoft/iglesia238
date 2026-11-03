import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { BadgeTone, StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  CONTRIBUTION_CATEGORY_LABELS,
  CONTRIBUTION_STATUS_LABELS,
  ContributionDisplayStatus,
  PAYMENT_METHOD_LABELS,
} from '../../data/accounting.models';
import { ContributionRow } from '../data/contributions.models';
import { ContributionsRepository } from '../data/contributions.repository';

const STATUS_TONES: Readonly<Record<ContributionDisplayStatus, BadgeTone>> = {
  RECORDED: 'info',
  SETTLED: 'success',
  VOIDED: 'danger',
};

/** Side drawer with the whole story of a contribution: receipt, who recorded it, where it went. */
@Component({
  selector: 'app-contribution-detail-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, ErrorBannerComponent, IconComponent, LoadingComponent, MoneyPipe, RouterLink, StatusBadgeComponent],
  template: `
    <app-dialog [(open)]="open" variant="drawer" [title]="data()?.receiptNumber ?? 'Detalle del aporte'">
      @if (detail.error()) {
        <app-error-banner [message]="errorMessage()" (retry)="detail.reload()" />
      } @else if (detail.isLoading() || !data()) {
        <app-loading label="Cargando el aporte…" />
      } @else {
        @let row = data()!;
        <div class="stack">
          <div class="head">
            <div>
              <span class="text-muted text-small">{{ row.typeName }} · {{ categoryLabels[row.category] }}</span>
              <div class="head__amount" [class.voided]="row.status === 'VOIDED'">{{ row.amount | money }}</div>
            </div>
            <app-status-badge [label]="statusLabels[row.status]" [tone]="statusTones[row.status]" />
          </div>

          <dl class="details">
            <div><dt>Fecha del aporte</dt><dd>{{ row.receivedOn | date: 'dd/MM/yyyy' }}</dd></div>
            <div><dt>Aportante</dt><dd>{{ row.contributorName ?? (row.notes ? 'Colecta agregada' : 'Anónimo') }}</dd></div>
            @if (row.memberCode) {
              <div><dt>Código de miembro</dt><dd class="mono">{{ row.memberCode }}</dd></div>
            }
            <div><dt>Sede</dt><dd>{{ row.congregationName }}</dd></div>
            <div><dt>Medio de pago</dt><dd>{{ methodLabels[row.paymentMethod] }}</dd></div>
            @if (row.paymentReference) {
              <div><dt>Referencia</dt><dd class="mono">{{ row.paymentReference }}</dd></div>
            }
            @if (row.notes) {
              <div><dt>Descripción</dt><dd>{{ row.notes }}</dd></div>
            }
            @if (row.vowPledgeCode) {
              <div>
                <dt>Promesa de voto</dt>
                <dd><a routerLink="/accounting/vows" class="mono">{{ row.vowPledgeCode }}</a></dd>
              </div>
            }
          </dl>

          <section aria-labelledby="trace-title">
            <h3 id="trace-title">Trazabilidad</h3>
            <dl class="details">
              <div>
                <dt>Registrado</dt>
                <dd>{{ row.recordedAt | date: 'dd/MM/yyyy HH:mm' }}{{ row.recordedByName ? ' · ' + row.recordedByName : '' }}</dd>
              </div>
              <div>
                <dt>Libro de caja</dt>
                <dd>
                  @if (row.consolidationVoucher) {
                    Consolidado en <span class="mono">{{ row.consolidationVoucher }}</span>
                  } @else {
                    Pendiente de consolidar
                  }
                </dd>
              </div>
              <div>
                <dt>Liquidación del diezmo</dt>
                <dd>{{ row.settlementId ? 'Incluido en la liquidación #' + row.settlementId : 'No liquidado' }}</dd>
              </div>
            </dl>
          </section>

          @if (row.status === 'VOIDED') {
            <div class="alert alert--danger" role="note">
              <app-icon name="ban" />
              <span>
                <strong>Anulado</strong>
                {{ row.voidedAt ? 'el ' + (row.voidedAt | date: 'dd/MM/yyyy HH:mm') : '' }}{{ row.voidedByName ? ' por ' + row.voidedByName : '' }}.
                Motivo: {{ row.voidReason }}
              </span>
            </div>
          } @else if (row.voidBlock === 'SETTLED') {
            <div class="alert" role="note">
              <app-icon name="lock" />
              <span>Forma parte de una liquidación del diezmo: para anularlo hay que anular primero la liquidación.</span>
            </div>
          } @else if (row.voidBlock === 'CONSOLIDATED') {
            <div class="alert" role="note">
              <app-icon name="lock" />
              <span>Está consolidado en el Libro de caja: reversa primero la consolidación para poder anularlo.</span>
            </div>
          }
        </div>
      }
      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cerrar</button>
        @if (canWrite() && data(); as row) {
          @if (row.status === 'RECORDED' && !row.voidBlock) {
            <button type="button" class="btn btn--danger" (click)="voidRequested.emit(row)">Anular aporte</button>
          }
        }
      </div>
    </app-dialog>
  `,
  styles: `
    @use 'tokens' as *;

    .head {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: $space-3;
      padding: $space-4;
      border-radius: $radius-control;
      background: $color-surface-2;
    }

    .head__amount {
      font-size: $font-size-xl;
      font-weight: $font-weight-extrabold;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }

    .voided {
      text-decoration: line-through;
      color: $color-ink-muted;
    }
  `,
})
export class ContributionDetailDrawerComponent {
  private readonly repository = inject(ContributionsRepository);

  readonly open = model(false);
  readonly contributionId = input<number | null>(null);
  readonly canWrite = input(false);
  /** Asks the page to open the void dialog for this contribution. */
  readonly voidRequested = output<ContributionRow>();
  /** Bump to re-read the contribution after the page changed it. */
  readonly refresh = input(0);

  protected readonly categoryLabels = CONTRIBUTION_CATEGORY_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly statusLabels = CONTRIBUTION_STATUS_LABELS;
  protected readonly statusTones = STATUS_TONES;

  protected readonly detail = rxResource({
    params: () => {
      const id = this.contributionId();
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
