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
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { municipalityLabel } from '../../../../core/models/catalogs';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { paginate } from '../../../../shared/utils/pagination';
import { LegalEntityRow } from '../data/organization.models';
import { OrganizationRepository } from '../data/organization.repository';
import { ConfirmDialogComponent } from './confirm-dialog.component';
import {
  LegalEntityFormDialogComponent,
  LegalEntitySaved,
} from './legal-entity-form-dialog.component';

const PAGE_SIZE = 10;

/** "Razones sociales" tab: legal entities of the denomination. */
@Component({
  selector: 'app-legal-entities-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LegalEntityFormDialogComponent,
    LoadingComponent,
    PaginationComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './legal-entities-panel.component.html',
  styleUrl: './organization-panel.scss',
})
export class LegalEntitiesPanelComponent {
  private readonly repository = inject(OrganizationRepository);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly canManage = input(false);
  readonly changed = output<string>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly legalEntities = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.listLegalEntities(),
  });
  protected readonly page = linkedSignal({
    source: () => this.legalEntities.value()?.length ?? 0,
    computation: () => 1,
  });
  protected readonly visible = computed(() =>
    paginate(this.legalEntities.value() ?? [], { page: this.page(), pageSize: PAGE_SIZE }),
  );
  protected readonly loadError = computed(() => {
    const error = this.legalEntities.error();
    return error ? userMessage(error) : null;
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<LegalEntityRow | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly statusTarget = signal<LegalEntityRow | null>(null);
  protected readonly pending = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected municipality(code: string | null): string {
    return municipalityLabel(code);
  }

  openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected openEdit(row: LegalEntityRow): void {
    this.editing.set(row);
    this.formOpen.set(true);
  }

  protected openStatus(row: LegalEntityRow): void {
    this.actionError.set(null);
    this.statusTarget.set(row);
    this.confirmOpen.set(true);
  }

  protected onSaved({ legalEntity, created }: LegalEntitySaved): void {
    this.changed.emit(
      created
        ? `Razón social «${legalEntity.legalName}» registrada.`
        : `Cambios guardados en «${legalEntity.legalName}».`,
    );
    this.legalEntities.reload();
  }

  protected confirmStatus(): void {
    const row = this.statusTarget();
    if (!row || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.actionError.set(null);
    this.repository
      .setLegalEntityActive(row.id, !row.isActive)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updated) => {
          this.pending.set(false);
          this.confirmOpen.set(false);
          this.changed.emit(
            updated.isActive
              ? `Razón social «${updated.legalName}» activada.`
              : `Razón social «${updated.legalName}» desactivada.`,
          );
          this.legalEntities.reload();
        },
        error: (error: unknown) => {
          this.pending.set(false);
          this.actionError.set(userMessage(error));
        },
      });
  }
}
