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
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { matchesText, paginate } from '../../../../shared/utils/pagination';
import { ConfirmDialogComponent } from '../../../organization/structure/components/confirm-dialog.component';
import {
  COUNTRY_STATUS_OPTIONS,
  CountryStatusFilter,
  PlatformCountryRow,
} from '../data/platform-countries.models';
import { PlatformCountriesRepository } from '../data/platform-countries.repository';

const PAGE_SIZE = 10;

/** "Países" section of the platform: the geography each legal entity can belong to, and its status. */
@Component({
  selector: 'app-platform-countries-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ConfirmDialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    LoadingComponent,
    PaginationComponent,
    StatusBadgeComponent,
  ],
  templateUrl: './platform-countries-panel.component.html',
  styleUrl: './platform-countries-panel.component.scss',
})
export class PlatformCountriesPanelComponent {
  private readonly repository = inject(PlatformCountriesRepository);
  private readonly catalogs = inject(CatalogsStore);
  private readonly destroyRef = inject(DestroyRef);

  readonly canManage = input(false);
  readonly changed = output<string>();

  protected readonly pageSize = PAGE_SIZE;
  protected readonly statusOptions = COUNTRY_STATUS_OPTIONS;
  protected readonly search = signal('');
  protected readonly status = signal<CountryStatusFilter>('all');

  protected readonly countries = rxResource({ stream: () => this.repository.list() });
  private readonly filtered = computed(() => {
    const rows = this.countries.hasValue() ? this.countries.value() : [];
    const status = this.status();
    const text = this.search();
    return rows
      .filter((row) => (status === 'all' || row.isActive) && matchesText([row.name, row.isoAlpha2], text))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  });
  protected readonly page = linkedSignal({
    source: () => ({ search: this.search(), status: this.status(), total: this.filtered().length }),
    computation: () => 1,
  });
  protected readonly visible = computed(() => paginate(this.filtered(), { page: this.page(), pageSize: PAGE_SIZE }));
  protected readonly loadError = computed(() => {
    const error = this.countries.error();
    return error ? userMessage(error) : null;
  });

  protected readonly confirmOpen = signal(false);
  protected readonly statusTarget = signal<PlatformCountryRow | null>(null);
  protected readonly pending = signal(false);
  protected readonly actionError = signal<string | null>(null);

  protected onSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected onStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as CountryStatusFilter);
  }

  protected openStatus(row: PlatformCountryRow): void {
    this.actionError.set(null);
    this.statusTarget.set(row);
    this.confirmOpen.set(true);
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
          // The "País" selects must stop (or start) offering this country.
          this.catalogs.forgetCountries();
          this.changed.emit(
            updated.isActive ? `País «${updated.name}» activado.` : `País «${updated.name}» desactivado.`,
          );
          this.countries.reload();
        },
        error: (error: unknown) => {
          this.pending.set(false);
          // E.g. COUNTRY_IN_USE (409): active legal entities still belong to the country.
          this.actionError.set(userMessage(error));
        },
      });
  }
}
