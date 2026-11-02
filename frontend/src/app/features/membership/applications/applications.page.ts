import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
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
import { paginate } from '../../../shared/utils/pagination';
import { ApplicationDetailComponent } from './components/application-detail.component';
import { ApplicationListComponent } from './components/application-list.component';
import { ApplicationStatusFilterComponent } from './components/application-status-filter.component';
import {
  APPLICATION_FILTER_TITLES,
  ApplicationDetail,
  ApplicationFilter,
  parseApplicationFilter,
} from './data/applications.models';
import { ApplicationsRepository } from './data/applications.repository';

const PAGE_SIZE = 8;

/** Feedback of the last command, shown above the detail in a live region. */
type ReviewNotice =
  | {
      readonly kind: 'approved';
      readonly memberId: number;
      readonly memberCode: string;
      readonly text: string;
    }
  | { readonly kind: 'info'; readonly text: string };

/**
 * C-03/C-04: queue of applications of the active sede (or of every sede of the denomination)
 * with a master/detail review. The chip and the selected application live in the URL
 * (?status=…&id=…) so a review can be shared or reloaded.
 */
@Component({
  selector: 'app-applications-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
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

  protected readonly userMessage = userMessage;
  protected readonly filter = computed(() => parseApplicationFilter(this.status()));
  protected readonly canReview = computed(() => this.auth.can('applications.review'));
  protected readonly reviewerName = computed(() => this.auth.user()?.displayName ?? '');
  protected readonly denominationWide = computed(() => this.auth.tenant().congregationId === null);
  protected readonly scopeLabel = computed(() =>
    this.denominationWide()
      ? 'todas las sedes de la denominación'
      : (this.auth.activeScope()?.label ?? 'tu sede'),
  );

  protected readonly queue = rxResource({
    params: () => ({ filter: this.filter(), tenant: this.auth.tenant() }),
    stream: ({ params }) => this.repository.list(params.filter),
  });

  protected readonly page = linkedSignal({ source: this.filter, computation: () => 1 });
  protected readonly pageSize = PAGE_SIZE;
  protected readonly items = computed(() =>
    this.queue.hasValue() ? this.queue.value().items : [],
  );
  protected readonly pagedItems = computed(
    () => paginate(this.items(), { page: this.page(), pageSize: PAGE_SIZE }).items,
  );
  protected readonly listTitle = computed(
    () => `${this.items().length} ${APPLICATION_FILTER_TITLES[this.filter()]}`,
  );

  /** The application in the URL, or the first one of the queue. */
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
   * "No es la misma persona" decisions of this review session, by application id. Approval stays
   * blocked: two persons of the denomination cannot share a document, so the reviewer rejects
   * the application for the applicant to correct the document.
   */
  private readonly dismissedMatches = signal<ReadonlySet<number>>(new Set());
  protected readonly duplicateDismissed = computed(() => {
    const id = this.selectedId();
    return id !== null && this.dismissedMatches().has(id);
  });

  protected selectFilter(filter: ApplicationFilter): void {
    this.clearFeedback();
    void this.navigate({ status: filter === 'PENDING' ? null : filter.toLowerCase(), id: null });
  }

  protected selectApplication(id: number): void {
    this.clearFeedback();
    void this.navigate({ id });
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
      text: `Solicitud rechazada. El solicitante verá el motivo al consultar el código ${application.trackingCode}.`,
    }));
  }

  protected markDuplicate(application: ApplicationDetail, personId: number): void {
    void this.run(application, this.repository.markDuplicate(application.id, personId), () => ({
      kind: 'info',
      text: `Solicitud marcada como duplicada y enlazada a Persona #${personId}. No se creó un miembro nuevo.`,
    }));
  }

  protected approve(application: ApplicationDetail): void {
    void this.run(
      application,
      this.repository.approve(application.id),
      (result) => ({
        kind: 'approved',
        memberId: result.memberId,
        memberCode: result.memberCode,
        text: `${application.fullName} ya figura en Miembros de ${application.congregationName} con su autorización de datos registrada.`,
      }),
    );
  }

  protected dismissNotice(): void {
    this.notice.set(null);
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
