import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, linkedSignal, model, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { PAYMENT_METHOD_LABELS } from '../../data/accounting.models';
import { percentLabel } from '../data/tithe-labels';
import { SETTLEMENT_STATUS_LABELS, TitheSettlementRow } from '../data/tithe-settlements.models';
import { TitheSettlementsRepository } from '../data/tithe-settlements.repository';

/** Read-only view of an issued or voided settlement: copied percentages, tithes and the cash lines it generated. */
@Component({
  selector: 'app-settlement-detail-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, ErrorBannerComponent, IconComponent, LoadingComponent, MoneyPipe, StatusBadgeComponent],
  template: `
    <app-dialog [(open)]="open" variant="wide" [title]="'Liquidación ' + (settlement()?.number ?? '')">
      @if (detail.error(); as error) {
        <app-error-banner [message]="errorMessage(error)" (retry)="detail.reload()" />
      } @else if (!detail.hasValue()) {
        <app-loading label="Cargando detalle…" />
      } @else {
        @let data = detail.value()!;
        <div class="stack">
          <dl class="details">
            <div>
              <dt>Estado</dt>
              <dd><app-status-badge [label]="labels[data.status]" [tone]="data.status === 'ISSUED' ? 'success' : 'danger'" /></dd>
            </div>
            <div>
              <dt>Sede</dt>
              <dd>{{ data.congregationName }}</dd>
            </div>
            <div>
              <dt>Rango cubierto</dt>
              <dd>{{ data.coveredFrom | date: 'dd/MM/yyyy' }} – {{ data.coveredTo | date: 'dd/MM/yyyy' }}</dd>
            </div>
            <div>
              <dt>Liquidada el</dt>
              <dd>{{ data.settledOn | date: 'dd/MM/yyyy' }}</dd>
            </div>
            <div>
              <dt>Bruto</dt>
              <dd class="amount">{{ data.grossTithe | money }}</dd>
            </div>
            <div>
              <dt>Participación nacional ({{ percent(data.nationalShareRate) }})</dt>
              <dd class="amount">{{ data.nationalShare | money }}</dd>
            </div>
            <div>
              <dt>Fondo local ({{ percent(data.localFundRate) }} del neto)</dt>
              <dd class="amount">{{ data.localFundShare | money }}</dd>
            </div>
            <div>
              <dt>Asignación pastoral</dt>
              <dd class="amount">{{ data.pastorNet | money }}</dd>
            </div>
          </dl>

          @if (data.status === 'VOIDED') {
            <div class="alert alert--danger" role="note">
              <span>
                Anulada {{ data.voidedAt | date: 'dd/MM/yyyy HH:mm' }}{{ data.voidedByName ? ' por ' + data.voidedByName : '' }}.
                Motivo: {{ data.voidReason }}
              </span>
            </div>
          }

          <section aria-labelledby="detail-cash-title">
            <h3 id="detail-cash-title">Movimientos de caja generados</h3>
            @if (data.cashLines.length === 0) {
              <p class="text-muted text-small">Esta liquidación no generó movimientos de caja.</p>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <caption class="visually-hidden">Movimientos del libro de caja de la liquidación</caption>
                  <thead>
                    <tr>
                      <th scope="col">Fecha</th>
                      <th scope="col">Cuenta</th>
                      <th scope="col">Fondo</th>
                      <th scope="col">Descripción</th>
                      <th scope="col" class="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (line of data.cashLines; track line.id) {
                      <tr>
                        <td>{{ line.postedOn | date: 'dd/MM/yyyy' }}</td>
                        <td>{{ line.accountCode }} · {{ line.accountName }}</td>
                        <td>{{ line.fundName }}</td>
                        <td>
                          {{ line.description }}
                          @if (line.isReversal) {
                            <span class="chip">Reversa</span>
                          }
                        </td>
                        <td class="num">{{ line.direction === 'OUT' ? '−' : '+' }}{{ line.amount | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>

          <section aria-labelledby="detail-tithes-title">
            <h3 id="detail-tithes-title">Diezmos incluidos ({{ data.contributions.length }})</h3>
            @if (data.contributions.length === 0) {
              <p class="text-muted text-small">
                {{ data.status === 'VOIDED' ? 'Los diezmos fueron liberados al anular la liquidación.' : 'No hay diezmos vinculados.' }}
              </p>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <caption class="visually-hidden">Diezmos incluidos en la liquidación</caption>
                  <thead>
                    <tr>
                      <th scope="col">Recibo</th>
                      <th scope="col">Fecha</th>
                      <th scope="col">Aportante</th>
                      <th scope="col">Medio de pago</th>
                      <th scope="col" class="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of data.contributions; track row.id) {
                      <tr>
                        <td class="code">{{ row.receiptNumber ?? '—' }}</td>
                        <td>{{ row.receivedOn | date: 'dd/MM/yyyy' }}</td>
                        <td>
                          <div [class.text-muted]="!row.contributorName">{{ row.contributorName ?? 'Anónimo' }}</div>
                          <div class="text-muted text-small mono">{{ row.memberCode ?? '' }}</div>
                        </td>
                        <td>{{ methodLabels[row.paymentMethod] }}</td>
                        <td class="num">{{ row.amount | money }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </section>
        </div>
      }
      <div dialog-footer>
        @if (actError(); as message) {
          <p class="alert alert--danger" role="alert">{{ message }}</p>
        }
        <button
          type="button"
          class="btn btn--secondary"
          [disabled]="!detail.hasValue() || downloading()"
          (click)="downloadAct()"
        >
          <app-icon name="download" />
          Descargar acta (PDF)
        </button>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cerrar</button>
      </div>
    </app-dialog>
  `,
})
export class SettlementDetailDialogComponent {
  private readonly repository = inject(TitheSettlementsRepository);
  private readonly downloads = inject(FileDownloadService);

  readonly open = model(false);
  readonly settlement = input.required<TitheSettlementRow | null>();

  protected readonly labels = SETTLEMENT_STATUS_LABELS;
  protected readonly methodLabels = PAYMENT_METHOD_LABELS;
  protected readonly percent = percentLabel;
  protected readonly errorMessage = userMessage;

  private readonly target = computed(() => (this.open() ? (this.settlement()?.id ?? null) : null));

  protected readonly detail = rxResource({
    params: () => this.target() ?? undefined,
    stream: ({ params }) => this.repository.detail(params),
  });

  protected readonly downloading = signal(false);
  /** An error of the last download; it is forgotten when the dialog shows another settlement. */
  protected readonly actError = linkedSignal<number | null, string | null>({ source: this.target, computation: () => null });

  /** The act is printed by the API (letterhead, signatures); a voided settlement prints too, marked as voided. */
  protected downloadAct(): void {
    const settlement = this.settlement();
    if (!settlement || this.downloading()) {
      return;
    }
    this.downloading.set(true);
    this.actError.set(null);
    this.repository.reportPdf(settlement.id).subscribe({
      next: (file) => {
        this.downloads.save(file.blob, file.filename);
        this.downloading.set(false);
      },
      error: (error: unknown) => {
        this.actError.set(userMessage(error));
        this.downloading.set(false);
      },
    });
  }
}
