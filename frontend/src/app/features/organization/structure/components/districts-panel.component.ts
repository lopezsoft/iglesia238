import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { paginate } from '../../../../shared/utils/pagination';
import { DistrictRow } from '../data/organization.models';
import { OrganizationRepository } from '../data/organization.repository';
import { DistrictFormDialogComponent, DistrictSaved } from './district-form-dialog.component';

const PAGE_SIZE = 10;

/** "Distritos" tab: territorial grouping of the sedes. */
@Component({
  selector: 'app-districts-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DistrictFormDialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    PaginationComponent,
  ],
  styleUrl: './organization-panel.scss',
  template: `
    <div class="panel-header">
      <h2>Distritos</h2>
      <span class="text-muted text-small"
        >Agrupación territorial de sedes para supervisión pastoral.</span
      >
    </div>

    <div class="card card--flush">
      @if (loadError(); as message) {
        <div class="panel-feedback">
          <app-error-banner [message]="message" (retry)="districts.reload()" />
        </div>
      } @else if (districts.isLoading() && !districts.value()) {
        <div class="panel-feedback"><app-loading label="Cargando distritos…" /></div>
      } @else if (visible().total === 0) {
        <app-empty-state
          icon="building"
          title="Aún no hay distritos"
          description="Los distritos son opcionales."
        />
      } @else {
        <div class="table-wrap">
          <table class="table" [attr.aria-busy]="districts.isLoading()">
            <thead>
              <tr>
                <th scope="col">Número</th>
                <th scope="col">Nombre</th>
                <th scope="col">Sedes</th>
                @if (canManage()) {
                  <th scope="col"><span class="visually-hidden">Acciones</span></th>
                }
              </tr>
            </thead>
            <tbody>
              @for (row of visible().items; track row.id) {
                <tr>
                  <td class="code">{{ row.number }}</td>
                  <td class="cell-title">{{ row.name ?? '—' }}</td>
                  <td>
                    <strong>{{ row.congregationNames.length }}</strong>
                    <span class="text-muted">
                      ·
                      {{
                        row.congregationNames.length
                          ? row.congregationNames.join(', ')
                          : 'Sin sedes asignadas'
                      }}
                    </span>
                  </td>
                  @if (canManage()) {
                    <td>
                      <div class="row-actions">
                        <button
                          type="button"
                          class="btn btn--secondary btn--sm"
                          [attr.aria-label]="'Editar distrito ' + row.number"
                          (click)="openEdit(row)"
                        >
                          Editar
                        </button>
                      </div>
                    </td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>
        <app-pagination
          [page]="page()"
          [pageSize]="pageSize"
          [total]="visible().total"
          (pageChange)="page.set($event)"
        />
      }
    </div>

    <app-district-form-dialog
      [(open)]="formOpen"
      [district]="editing()"
      (saved)="onSaved($event)"
    />
  `,
})
export class DistrictsPanelComponent {
  private readonly repository = inject(OrganizationRepository);
  private readonly auth = inject(AuthService);

  readonly canManage = input(false);
  readonly changed = output<string>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly districts = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listDistricts(),
  });
  protected readonly page = linkedSignal({
    source: () => this.districts.value()?.length ?? 0,
    computation: () => 1,
  });
  protected readonly visible = computed(() =>
    paginate(this.districts.value() ?? [], { page: this.page(), pageSize: PAGE_SIZE }),
  );
  protected readonly loadError = computed(() => {
    const error = this.districts.error();
    return error ? userMessage(error) : null;
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<DistrictRow | null>(null);

  openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(row: DistrictRow): void {
    this.editing.set(row);
    this.formOpen.set(true);
  }

  protected onSaved({ district, created }: DistrictSaved): void {
    this.changed.emit(
      created
        ? `Distrito ${district.number} creado.`
        : `Cambios guardados en el distrito ${district.number}.`,
    );
    this.districts.reload();
  }
}
