import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { MoneyPipe } from '../../../../shared/pipes/money.pipe';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { EmptyStateComponent, ErrorBannerComponent, LoadingComponent, PaginationComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { SegmentedControlComponent, SegmentOption } from '../../../../shared/ui/segmented-control.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { VOUCHER_KIND_LABELS, VoucherKind, VoucherListItem, VoucherQuery } from '../data/cash-book.models';
import { CashBookRepository } from '../data/cash-book.repository';

const PAGE_SIZE = 15;

/** Vouchers of the sede (receipts, cash vouchers and settlements): filters, paging and a detail drawer. */
@Component({
  selector: 'app-vouchers-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    MoneyPipe,
    PaginationComponent,
    SegmentedControlComponent,
    StatusBadgeComponent,
  ],
  styleUrl: './vouchers-panel.component.scss',
  template: `
    <section class="card card--flush" aria-labelledby="vouchers-title">
      <div class="card__header vouchers__header">
        <div>
          <h2 id="vouchers-title">Comprobantes</h2>
          <p class="text-muted text-small">
            Recibos de aporte, comprobantes de ingreso y egreso y liquidaciones de la sede, del más reciente al más antiguo.
          </p>
        </div>
      </div>

      <div class="toolbar vouchers__filters">
        <app-segmented-control [options]="typeOptions()" [value]="type()" (valueChange)="setType($event)" ariaLabel="Tipo de comprobante" />
        <div class="field">
          <label for="voucher-from">Desde</label>
          <input id="voucher-from" class="input" type="date" [value]="from()" (change)="setFrom($any($event.target).value)" />
        </div>
        <div class="field">
          <label for="voucher-to">Hasta</label>
          <input id="voucher-to" class="input" type="date" [value]="to()" (change)="setTo($any($event.target).value)" />
        </div>
        <div class="field">
          <label for="voucher-number">Número</label>
          <input
            id="voucher-number"
            class="input mono"
            type="number"
            inputmode="numeric"
            min="1"
            placeholder="Ej. 45"
            [value]="numberText()"
            (input)="onNumber($any($event.target).value)"
          />
        </div>
        <div class="field">
          <label for="voucher-status">Estado</label>
          <select id="voucher-status" class="select" (change)="setStatus($any($event.target).value)">
            <option value="" [selected]="status() === ''">Todos</option>
            <option value="ISSUED" [selected]="status() === 'ISSUED'">Emitidos</option>
            <option value="VOIDED" [selected]="status() === 'VOIDED'">Anulados</option>
          </select>
        </div>
        @if (hasFilters()) {
          <button type="button" class="btn btn--ghost btn--sm" (click)="clear()">Limpiar filtros</button>
        }
      </div>

      @if (downloadError(); as problem) {
        <div class="alert alert--danger vouchers__download-error" role="alert">{{ problem }}</div>
      }

      @if (list.error(); as error) {
        <div class="vouchers__state"><app-error-banner [message]="message(error)" (retry)="list.reload()" /></div>
      } @else if (!list.value()) {
        <div class="vouchers__state"><app-loading label="Cargando comprobantes…" /></div>
      } @else if (list.value()!.total === 0) {
        <app-empty-state
          icon="receipt"
          title="Sin comprobantes"
          [description]="hasFilters() ? 'Ningún comprobante coincide con los filtros.' : 'Aún no se han emitido comprobantes en esta sede.'"
        />
      } @else {
        <div class="table-wrap">
          <table class="table">
            <caption class="visually-hidden">Comprobantes de la sede</caption>
            <thead>
              <tr>
                <th scope="col">Comprobante</th>
                <th scope="col">Tipo</th>
                <th scope="col">Fecha</th>
                <th scope="col" class="text-right">Valor</th>
                <th scope="col">Estado</th>
                <th scope="col"><span class="visually-hidden">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              @for (voucher of list.value()!.items; track voucher.id) {
                <tr>
                  <td class="code">{{ voucher.code }}</td>
                  <td>{{ voucher.typeLabel }}</td>
                  <td>{{ voucher.issuedOn | date: 'dd/MM/yyyy' }}</td>
                  <td class="num">{{ voucher.amount | money }}</td>
                  <td>
                    <app-status-badge [label]="voucher.status === 'VOIDED' ? 'Anulado' : 'Emitido'" [tone]="voucher.status === 'VOIDED' ? 'danger' : 'success'" />
                  </td>
                  <td class="text-right">
                    <div class="vouchers__actions">
                      <button type="button" class="btn btn--secondary btn--sm" [attr.aria-label]="'Ver comprobante ' + voucher.code" (click)="show(voucher)">
                        <app-icon name="eye" [size]="16" /> Ver
                      </button>
                      <button
                        type="button"
                        class="btn btn--ghost btn--sm"
                        [disabled]="downloadingId() === voucher.id"
                        [attr.aria-label]="'Descargar el comprobante ' + voucher.code + ' en PDF'"
                        (click)="download(voucher)"
                      >
                        <app-icon name="download" [size]="16" /> PDF
                      </button>
                    </div>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [pageSize]="pageSize" [total]="list.value()!.total" (pageChange)="page.set($event)" />
      }
    </section>

    <app-dialog [(open)]="detailOpen" [title]="selected()?.code ?? 'Comprobante'" variant="drawer">
      @if (detail.error(); as error) {
        <div class="alert alert--danger" role="alert">{{ message(error) }}</div>
      } @else if (detail.value(); as voucher) {
        <div class="stack">
          <dl class="detail">
            <div><dt>Tipo</dt><dd>{{ voucher.typeLabel }}</dd></div>
            <div><dt>Fecha</dt><dd>{{ voucher.issuedOn | date: 'dd/MM/yyyy' }}</dd></div>
            <div><dt>Valor</dt><dd class="amount">{{ voucher.amount | money }}</dd></div>
            <div>
              <dt>Estado</dt>
              <dd>
                <app-status-badge [label]="voucher.status === 'VOIDED' ? 'Anulado' : 'Emitido'" [tone]="voucher.status === 'VOIDED' ? 'danger' : 'success'" />
              </dd>
            </div>
          </dl>
          @if (voucher.voidReason) {
            <div class="alert alert--warning" role="note">Motivo de la anulación: {{ voucher.voidReason }}</div>
          }
          @if (voucher.lines.length > 0) {
            <h3>Movimientos de caja</h3>
            <ul class="lines">
              @for (line of voucher.lines; track line.id) {
                <li>
                  <div>
                    <span class="mono text-small">{{ line.accountCode }}</span> {{ line.accountName }}
                    <div class="text-muted text-small">{{ line.fundName }} · {{ line.postedOn | date: 'dd/MM/yyyy' }}</div>
                    <div class="text-small">{{ line.description }}</div>
                  </div>
                  <span class="amount" [class.is-out]="line.direction === 'OUT'">
                    {{ line.direction === 'OUT' ? '−' : '+' }}{{ line.amount | money }}
                  </span>
                </li>
              }
            </ul>
          }
          @if (voucher.contributionRows.length > 0) {
            <h3>Aportes</h3>
            <ul class="lines">
              @for (row of voucher.contributionRows; track row.id) {
                <li>
                  <div>
                    {{ row.typeName }}
                    <div class="text-muted text-small">{{ row.receivedOn | date: 'dd/MM/yyyy' }}{{ row.status === 'VOIDED' ? ' · anulado' : '' }}</div>
                  </div>
                  <span class="amount">{{ row.amount | money }}</span>
                </li>
              }
            </ul>
          }
          @if (voucher.lines.length === 0 && voucher.contributionRows.length === 0) {
            <p class="text-muted">Este comprobante no tiene movimientos ni aportes asociados.</p>
          }
        </div>
      } @else {
        <app-loading label="Cargando comprobante…" />
      }
      <div dialog-footer>
        @if (selected(); as current) {
          <button type="button" class="btn btn--secondary" [disabled]="downloadingId() === current.id" (click)="download(current)">
            <app-icon name="download" [size]="16" /> Descargar PDF
          </button>
        }
        <button type="button" class="btn btn--secondary" (click)="detailOpen.set(false)">Cerrar</button>
      </div>
    </app-dialog>
  `,
})
export class VouchersPanelComponent {
  private readonly repository = inject(CashBookRepository);
  private readonly auth = inject(AuthService);
  private readonly downloads = inject(FileDownloadService);

  protected readonly pageSize = PAGE_SIZE;
  protected readonly downloadingId = signal<number | null>(null);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly message = userMessage;

  protected readonly type = signal<VoucherKind | ''>('');
  protected readonly from = signal('');
  protected readonly to = signal('');
  protected readonly status = signal<'' | 'ISSUED' | 'VOIDED'>('');
  protected readonly numberText = signal('');
  /** The number is applied after a pause, so each keystroke does not hit the API. */
  protected readonly number = signal<number | undefined>(undefined);
  private readonly typedNumber = new Subject<string>();

  protected readonly page = linkedSignal<unknown, number>({
    source: () => [this.type(), this.from(), this.to(), this.status(), this.number()],
    computation: () => 1,
  });

  protected readonly typeOptions = computed<readonly SegmentOption[]>(() => [
    { value: '', label: 'Todos' },
    ...(Object.keys(VOUCHER_KIND_LABELS) as VoucherKind[]).map((kind) => ({ value: kind, label: kind })),
  ]);

  protected readonly hasFilters = computed(
    () => this.type() !== '' || this.from() !== '' || this.to() !== '' || this.status() !== '' || this.number() !== undefined,
  );

  protected readonly list = rxResource({
    params: () => ({ tenant: this.auth.tenant(), query: this.query() }),
    stream: ({ params }) => this.repository.vouchers(params.query),
  });

  protected readonly selected = signal<VoucherListItem | null>(null);
  protected readonly detailOpen = signal(false);
  protected readonly detail = rxResource({
    params: () => (this.detailOpen() ? this.selected()?.id : undefined),
    stream: ({ params }) => this.repository.voucher(params),
  });

  private readonly query = computed<VoucherQuery>(() => ({
    page: this.page(),
    pageSize: PAGE_SIZE,
    type: this.type() || undefined,
    from: this.from() || undefined,
    to: this.to() || undefined,
    status: this.status() || undefined,
    number: this.number(),
  }));

  constructor() {
    this.typedNumber.pipe(debounceTime(350), takeUntilDestroyed()).subscribe((text) => {
      const value = Number(text);
      this.number.set(text.trim() !== '' && Number.isInteger(value) && value > 0 ? value : undefined);
    });
  }

  /** Fetches the printable PDF (the bearer token rules out a plain link) and hands it to the browser. */
  protected download(voucher: VoucherListItem): void {
    if (this.downloadingId() !== null) {
      return;
    }
    this.downloadingId.set(voucher.id);
    this.downloadError.set(null);
    this.repository.voucherPdf(voucher.id).subscribe({
      next: (blob) => {
        this.downloads.save(blob, `${voucher.code}.pdf`);
        this.downloadingId.set(null);
      },
      error: (error: unknown) => {
        this.downloadError.set(userMessage(error));
        this.downloadingId.set(null);
      },
    });
  }

  protected setType(value: string): void {
    this.type.set(value as VoucherKind | '');
  }

  protected setFrom(value: string): void {
    this.from.set(value);
  }

  protected setTo(value: string): void {
    this.to.set(value);
  }

  protected setStatus(value: string): void {
    this.status.set(value === 'ISSUED' || value === 'VOIDED' ? value : '');
  }

  protected onNumber(text: string): void {
    this.numberText.set(text);
    this.typedNumber.next(text);
  }

  protected clear(): void {
    this.type.set('');
    this.from.set('');
    this.to.set('');
    this.status.set('');
    this.numberText.set('');
    this.number.set(undefined);
  }

  protected show(voucher: VoucherListItem): void {
    this.selected.set(voucher);
    this.detailOpen.set(true);
  }
}
