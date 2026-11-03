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
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { paginate } from '../../../../shared/utils/pagination';
import { ConfirmDialogComponent } from '../../../organization/structure/components/confirm-dialog.component';
import { DenominationsRepository } from '../../denominations/data/denominations.repository';
import { DenominationOption, PlatformLegalEntityRow, municipalityLabel } from '../data/platform-legal-entities.models';
import { PlatformLegalEntitiesRepository } from '../data/platform-legal-entities.repository';
import {
  PlatformLegalEntityFormDialogComponent,
  PlatformLegalEntitySaved,
} from './platform-legal-entity-form-dialog.component';

const PAGE_SIZE = 10;
/** Largest page the API serves: enough to list every church in the filter and in the form. */
const DENOMINATIONS_LIMIT = 100;

/** "Razones sociales" section of the platform: the legal entities of every church, filtered by church. */
@Component({
  selector: 'app-platform-legal-entities-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    PaginationComponent,
    PlatformLegalEntityFormDialogComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './platform-legal-entities-panel.component.html',
  styleUrl: './platform-legal-entities-panel.component.scss',
})
export class PlatformLegalEntitiesPanelComponent {
  private readonly repository = inject(PlatformLegalEntitiesRepository);
  private readonly denominationsRepository = inject(DenominationsRepository);
  private readonly destroyRef = inject(DestroyRef);

  readonly canManage = input(false);
  readonly changed = output<string>();

  protected readonly pageSize = PAGE_SIZE;
  /** `null`: every church. */
  protected readonly denominationFilter = signal<number | null>(null);

  protected readonly denominations = rxResource({
    stream: () =>
      this.denominationsRepository.list({ search: '', status: 'all', page: 1, pageSize: DENOMINATIONS_LIMIT }),
  });
  protected readonly denominationOptions = computed<readonly DenominationOption[]>(() =>
    this.denominations.hasValue()
      ? this.denominations
          .value()
          .items.map(({ id, name, isActive }) => ({ id, name, isActive }))
          .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }))
      : [],
  );

  protected readonly legalEntities = rxResource({
    params: () => ({ denominationId: this.denominationFilter() }),
    stream: ({ params }) => this.repository.list(params.denominationId),
  });
  protected readonly page = linkedSignal({
    source: () => ({ filter: this.denominationFilter(), total: this.legalEntities.value()?.length ?? 0 }),
    computation: () => 1,
  });
  protected readonly visible = computed(() =>
    paginate(this.legalEntities.value() ?? [], { page: this.page(), pageSize: PAGE_SIZE }),
  );
  protected readonly loadError = computed(() => {
    const error = this.legalEntities.error();
    return error ? userMessage(error) : null;
  });
  protected readonly denominationsError = computed(() => {
    const error = this.denominations.error();
    return error ? userMessage(error) : null;
  });

  protected readonly formOpen = signal(false);
  protected readonly editing = signal<PlatformLegalEntityRow | null>(null);
  protected readonly confirmOpen = signal(false);
  protected readonly statusTarget = signal<PlatformLegalEntityRow | null>(null);
  protected readonly pending = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected place(row: PlatformLegalEntityRow): string {
    return municipalityLabel(row);
  }

  openCreate(): void {
    this.editing.set(null);
    this.formOpen.set(true);
  }

  protected onFilter(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.denominationFilter.set(value === '' ? null : Number(value));
  }

  protected openEdit(row: PlatformLegalEntityRow): void {
    this.editing.set(row);
    this.formOpen.set(true);
  }

  protected openStatus(row: PlatformLegalEntityRow): void {
    this.actionError.set(null);
    this.statusTarget.set(row);
    this.confirmOpen.set(true);
  }

  protected onSaved({ legalEntity, created }: PlatformLegalEntitySaved): void {
    this.changed.emit(
      created
        ? `Razón social «${legalEntity.legalName}» registrada en ${legalEntity.denominationName}.`
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
      .setActive(row.id, !row.isActive)
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
