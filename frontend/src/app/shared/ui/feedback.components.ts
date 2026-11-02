import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Permission } from '../../core/auth/permission';
import { IconComponent, IconName } from './icon.component';

/** Polite live region while data loads. */
@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<p class="text-muted" role="status" aria-live="polite">{{ label() }}</p>`,
})
export class LoadingComponent {
  readonly label = input('Cargando…');
}

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 2rem 1rem;
      text-align: center;
    }
  `,
  template: `
    <app-icon [name]="icon()" [size]="28" />
    <h2>{{ title() }}</h2>
    @if (description()) {
      <p class="text-muted">{{ description() }}</p>
    }
    <ng-content />
  `,
})
export class EmptyStateComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly icon = input<IconName>('inbox');
}

/** Error banner with a retry action. The message must already be safe to show. */
@Component({
  selector: 'app-error-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="alert alert--danger" role="alert">
      <app-icon name="alert" />
      <div class="cluster">
        <span>{{ message() }}</span>
        @if (retryable()) {
          <button type="button" class="btn btn--secondary btn--sm" (click)="retry.emit()">Reintentar</button>
        }
      </div>
    </div>
  `,
})
export class ErrorBannerComponent {
  readonly message = input.required<string>();
  readonly retryable = input(true);
  readonly retry = output<void>();
}

/** Makes the access model visible when the role lacks a write permission. */
@Component({
  selector: 'app-read-only-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  template: `
    <div class="alert" role="note">
      <app-icon name="lock" />
      <span>
        Solo lectura: tu rol no tiene el permiso <code>{{ permission() }}</code>.
        @if (detail()) {
          {{ detail() }}
        }
      </span>
    </div>
  `,
})
export class ReadOnlyNoticeComponent {
  readonly permission = input.required<Permission>();
  readonly detail = input<string | null>(null);
}

/** "1–10 de 248" with previous and next buttons. Pages are 1-based. */
@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    :host {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
    }
  `,
  template: `
    <span class="text-muted text-small" aria-live="polite">{{ rangeLabel() }}</span>
    <div class="cluster">
      <button type="button" class="btn btn--secondary btn--sm" [disabled]="page() <= 1" (click)="pageChange.emit(page() - 1)">
        Anterior
      </button>
      <button type="button" class="btn btn--secondary btn--sm" [disabled]="page() >= lastPage()" (click)="pageChange.emit(page() + 1)">
        Siguiente
      </button>
    </div>
  `,
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly total = input.required<number>();
  readonly pageChange = output<number>();

  protected readonly lastPage = computed(() => Math.max(1, Math.ceil(this.total() / this.pageSize())));
  protected readonly rangeLabel = computed(() => {
    if (this.total() === 0) {
      return '0 resultados';
    }
    const from = (this.page() - 1) * this.pageSize() + 1;
    const to = Math.min(this.page() * this.pageSize(), this.total());
    return `${from}–${to} de ${this.total()}`;
  });
}
