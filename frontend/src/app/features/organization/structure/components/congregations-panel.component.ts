import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  input,
  linkedSignal,
  output,
  signal,
} from '@angular/core';
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { paginate } from '../../../../shared/utils/pagination';
import { CongregationRow, placeLabel } from '../data/organization.models';
import { OrganizationRepository } from '../data/organization.repository';
import {
  CongregationFormDialogComponent,
  CongregationSaved,
} from './congregation-form-dialog.component';
import { ConfirmDialogComponent } from './confirm-dialog.component';

const PAGE_SIZE = 10;

/** "Sedes" tab: list, public applications switch, create/edit and activate/deactivate. */
@Component({
  selector: 'app-congregations-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CongregationFormDialogComponent,
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    PaginationComponent,
    RouterLink,
    StatusBadgeComponent,
  ],
  templateUrl: './congregations-panel.component.html',
  styleUrl: './organization-panel.scss',
})
export class CongregationsPanelComponent {
  private readonly repository = inject(OrganizationRepository);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly canManage = input(false);
  readonly denominationName = input('');
  /** Success message of a write, for the page live region. */
  readonly changed = output<string>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly congregations = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listCongregations(),
  });
  /** Without a published policy the public form lists no sede, whatever their switch says. */
  protected readonly policyInForce = rxResource({
    params: () => (this.canManage() ? this.auth.tenant() : undefined),
    stream: () => this.repository.hasPolicyInForce(),
  });
  protected readonly policyMissing = computed(
    () => this.policyInForce.hasValue() && !this.policyInForce.value(),
  );
  protected readonly page = linkedSignal({
    source: () => this.congregations.value()?.length ?? 0,
    computation: () => 1,
  });
  protected readonly visible = computed(() =>
    paginate(this.congregations.value() ?? [], { page: this.page(), pageSize: PAGE_SIZE }),
  );
  protected readonly loadError = computed(() => {
    const error = this.congregations.error();
    return error ? userMessage(error) : null;
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<CongregationRow | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly statusTarget = signal<CongregationRow | null>(null);
  protected readonly pendingId = signal<number | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected place(row: CongregationRow): string {
    return placeLabel(row);
  }

  openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(row: CongregationRow): void {
    this.editing.set(row);
    this.formOpen.set(true);
  }

  protected openStatus(row: CongregationRow): void {
    this.actionError.set(null);
    this.statusTarget.set(row);
    this.confirmOpen.set(true);
  }

  protected onSaved({ congregation, created }: CongregationSaved): void {
    this.changed.emit(
      created
        ? `Sede «${congregation.name}» creada en ${placeLabel(congregation)} con el código ${congregation.code}.`
        : `Cambios guardados en «${congregation.name}».`,
    );
    this.congregations.reload();
  }

  protected toggleApplications(row: CongregationRow): void {
    this.actionError.set(null);
    this.run(
      row.id,
      this.repository.setAcceptsApplications(row.id, !row.acceptsApplications),
      (updated) =>
        updated.acceptsApplications
          ? `${updated.name} ahora acepta inscripciones públicas.`
          : `${updated.name} dejó de aparecer en el formulario público de inscripción.`,
    );
  }

  protected confirmStatus(): void {
    const row = this.statusTarget();
    if (!row) {
      return;
    }
    this.run(row.id, this.repository.setCongregationActive(row.id, !row.isActive), (updated) => {
      this.confirmOpen.set(false);
      return updated.isActive
        ? `Sede «${updated.name}» activada.`
        : `Sede «${updated.name}» desactivada. Ya no recibe inscripciones.`;
    });
  }

  private run(
    id: number,
    command: ReturnType<OrganizationRepository['setAcceptsApplications']>,
    success: (updated: CongregationRow) => string,
  ): void {
    if (this.pendingId() !== null) {
      return;
    }
    this.pendingId.set(id);
    command.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (updated) => {
        this.pendingId.set(null);
        this.changed.emit(success(updated));
        this.congregations.reload();
      },
      error: (error: unknown) => {
        this.pendingId.set(null);
        this.actionError.set(userMessage(error));
      },
    });
  }
}
