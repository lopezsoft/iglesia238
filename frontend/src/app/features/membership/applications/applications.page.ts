import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { userMessage } from '../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { ApplicationDetailComponent } from './components/application-detail.component';
import { ApplicationListComponent } from './components/application-list.component';
import { ApplicationStatusFilterComponent } from './components/application-status-filter.component';
import {
  APPLICATIONS_PAGE_SIZE,
  APPLICATION_FILTER_TITLES,
  ApplicationDetail,
  ApplicationFilter,
  ApplicationListQuery,
  parseApplicationFilter,
} from './data/applications.models';
import { ApplicationsRepository } from './data/applications.repository';

/** Feedback of the last command, shown above the detail in a live region. */
type ReviewNotice =
  | {
      readonly kind: 'approved';
      readonly memberId: number;
      readonly memberCode: string;
      readonly text: string;
    }
  | { readonly kind: 'info'; readonly text: string };

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function isoDayOrNull(value: string | undefined): string | null {
  return value && ISO_DAY.test(value) ? value : null;
}

/**
 * C-03/C-04: queue of applications of the active sede (or of every sede of the denomination)
 * with a master/detail review. The filters, the page and the selected application live in the URL
 * (?status=…&q=…&page=…&id=…) so a review can be shared or reloaded.
 */
@Component({
  selector: 'app-applications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    PageHeaderComponent,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
    EmptyStateComponent,
    PaginationComponent,
    ApplicationStatusFilterComponent,
    ApplicationListComponent,
    ApplicationDetailComponent,
  ],
  templateUrl: './applications.page.html',
  styleUrl: './applications.page.scss',
})
export class ApplicationsPage {
  private readonly repository = inject(ApplicationsRepository);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly auth = inject(AuthService);

  /** Query params, bound by withComponentInputBinding. */
  readonly status = input<string>();
  readonly id = input<string>();
  readonly q = input<string>();
  readonly from = input<string>();
  readonly to = input<string>();
  readonly order = input<string>();
  readonly page = input<string>();
  readonly sede = input<string>();

  protected readonly userMessage = userMessage;
  protected readonly pageSize = APPLICATIONS_PAGE_SIZE;
  protected readonly filter = computed(() => parseApplicationFilter(this.status()));
  protected readonly canReview = computed(() => this.auth.can('applications.review'));
  protected readonly reviewerName = computed(() => this.auth.user()?.displayName ?? '');
  protected readonly denominationWide = computed(() => this.auth.tenant().congregationId === null);
  protected readonly scopeLabel = computed(() =>
    this.denominationWide()
      ? 'todas las sedes de la denominación'
      : (this.auth.activeScope()?.label ?? 'tu sede'),
  );

  /** Sedes of the denomination the reviewer can narrow the queue to (denomination scope only). */
  protected readonly sedes = computed(() => {
    const { denominationId } = this.auth.tenant();
    return (this.auth.user()?.selectableScopes ?? []).filter(
      (scope) =>
        scope.kind === 'CONGREGATION' &&
        scope.denominationId === denominationId &&
        scope.congregationId !== null,
    );
  });

  protected readonly query = computed<ApplicationListQuery>(() => {
    const requestedPage = Number(this.page());
    const sedeId = Number(this.sede());
    return {
      filter: this.filter(),
      search: this.q()?.trim() ?? '',
      congregationId: this.denominationWide() && Number.isInteger(sedeId) && sedeId > 0 ? sedeId : null,
      from: isoDayOrNull(this.from()),
      to: isoDayOrNull(this.to()),
      order: this.order() === 'asc' ? 'asc' : 'desc',
      page: Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
      pageSize: APPLICATIONS_PAGE_SIZE,
    };
  });

  protected readonly filtersActive = computed(() => {
    const query = this.query();
    return query.search !== '' || query.congregationId !== null || !!query.from || !!query.to;
  });

  protected readonly filterForm = inject(NonNullableFormBuilder).group({
    q: [''],
    from: [''],
    to: [''],
    sede: [''],
    order: ['desc'],
  });

  protected readonly queue = rxResource({
    params: () => ({ query: this.query(), tenant: this.auth.tenant() }),
    stream: ({ params }) => this.repository.list(params.query),
  });

  protected readonly items = computed(() =>
    this.queue.hasValue() ? this.queue.value().items : [],
  );
  protected readonly total = computed(() => (this.queue.hasValue() ? this.queue.value().total : 0));
  protected readonly listTitle = computed(
    () => `${this.total()} ${APPLICATION_FILTER_TITLES[this.filter()]}`,
  );

  /** The application in the URL, or the first one of the page. */
  protected readonly selectedId = computed<number | null>(() => {
    const fromUrl = Number(this.id());
    if (Number.isInteger(fromUrl) && fromUrl > 0) {
      return fromUrl;
    }
    return this.items()[0]?.id ?? null;
  });

  protected readonly detail = rxResource({
    params: () => {
      const id = this.selectedId();
      return id === null ? undefined : { id, tenant: this.auth.tenant() };
    },
    stream: ({ params }) => this.repository.get(params.id),
  });

  protected readonly pending = signal(false);
  protected readonly commandError = signal<string | null>(null);
  protected readonly notice = signal<ReviewNotice | null>(null);
  /**
   * "No es la misma persona" decisions of this review session, by application id. A plain
   * approval stays blocked: two persons of the denomination cannot share a document, so the
   * reviewer rejects the application for the applicant to correct the document.
   */
  private readonly dismissedMatches = signal<ReadonlySet<number>>(new Set());
  protected readonly duplicateDismissed = computed(() => {
    const id = this.selectedId();
    return id !== null && this.dismissedMatches().has(id);
  });

  constructor() {
    // Mirror the URL in the filter form, so a shared link shows what it filters.
    effect(() => {
      const query = this.query();
      untracked(() =>
        this.filterForm.reset(
          {
            q: query.search,
            from: query.from ?? '',
            to: query.to ?? '',
            sede: query.congregationId?.toString() ?? '',
            order: query.order,
          },
          { emitEvent: false },
        ),
      );
    });
  }

  protected selectFilter(filter: ApplicationFilter): void {
    this.clearFeedback();
    void this.navigate({ status: filter === 'PENDING' ? null : filter.toLowerCase(), id: null, page: null });
  }

  protected selectApplication(id: number): void {
    this.clearFeedback();
    void this.navigate({ id });
  }

  protected changePage(page: number): void {
    void this.navigate({ page: page === 1 ? null : page, id: null });
  }

  protected applyFilters(): void {
    const { q, from, to, sede, order } = this.filterForm.getRawValue();
    this.clearFeedback();
    void this.navigate({
      q: q.trim() || null,
      from: from || null,
      to: to || null,
      sede: sede || null,
      order: order === 'asc' ? 'asc' : null,
      page: null,
      id: null,
    });
  }

  protected clearFilters(): void {
    this.filterForm.reset({ q: '', from: '', to: '', sede: '', order: 'desc' });
    this.applyFilters();
  }

  protected dismissDuplicate(application: ApplicationDetail): void {
    this.dismissedMatches.update((ids) => new Set(ids).add(application.id));
  }

  protected startReview(application: ApplicationDetail): void {
    void this.run(application, this.repository.startReview(application.id), () => ({
      kind: 'info',
      text: 'Tomaste la solicitud en revisión. Quedó asignada a tu nombre.',
    }));
  }

  protected reject(application: ApplicationDetail, reason: string): void {
    void this.run(application, this.repository.reject(application.id, reason), () => ({
      kind: 'info',
      text: 'Solicitud rechazada. El solicitante verá que no fue aprobada y que debe comunicarse con la secretaría; el motivo queda como nota interna.',
    }));
  }

  protected markDuplicate(application: ApplicationDetail, personId: number): void {
    void this.run(application, this.repository.markDuplicate(application.id, personId), () => ({
      kind: 'info',
      text: 'Solicitud marcada como duplicada y enlazada a la persona que ya tenía el documento. No se creó un miembro nuevo.',
    }));
  }

  protected approve(application: ApplicationDetail): void {
    void this.run(
      application,
      this.repository.approve(application.id),
      (result) => this.approvedNotice(application, result.memberId, result.memberCode),
    );
  }

  protected approveLinked(application: ApplicationDetail, personId: number): void {
    void this.run(
      application,
      this.repository.approve(application.id, { linkToPersonId: personId }),
      (result) => this.approvedNotice(application, result.memberId, result.memberCode),
    );
  }

  protected dismissNotice(): void {
    this.notice.set(null);
  }

  private approvedNotice(application: ApplicationDetail, memberId: number, memberCode: string): ReviewNotice {
    return {
      kind: 'approved',
      memberId,
      memberCode,
      text: `${application.fullName} ya figura en Miembros de ${application.congregationName} con su autorización de datos registrada.`,
    };
  }

  /** Runs a command, keeps the application selected and refreshes the queue and the detail. */
  private async run<T>(
    application: ApplicationDetail,
    command: Observable<T>,
    toNotice: (result: T) => ReviewNotice,
  ): Promise<void> {
    this.pending.set(true);
    this.clearFeedback();
    try {
      const result = await firstValueFrom(command);
      this.notice.set(toNotice(result));
      await this.navigate({ id: application.id });
      this.queue.reload();
      this.detail.reload();
    } catch (error) {
      this.commandError.set(userMessage(error));
      // The state may have changed under us (another reviewer): show the current one.
      this.queue.reload();
      this.detail.reload();
    } finally {
      this.pending.set(false);
    }
  }

  private clearFeedback(): void {
    this.notice.set(null);
    this.commandError.set(null);
  }

  private navigate(queryParams: Record<string, string | number | null>): Promise<boolean> {
    return this.router.navigate([], {
      relativeTo: this.route,
      queryParams,
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }
}
