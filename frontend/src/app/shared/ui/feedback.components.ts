import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PERMISSION_DESCRIPTIONS, Permission } from '../../core/auth/permission';
import { IconComponent, IconName } from './icon.component';
import { SpinnerComponent } from './spinner.component';

/** Polite live region while data loads. */
@Component({
  selector: 'app-loading',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [SpinnerComponent],
  styles: `
    :host {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.5rem 0;
    }
  `,
  template: `
    <app-spinner />
    <p class="text-muted" role="status" aria-live="polite">{{ label() }}</p>
  `,
})
export class LoadingComponent {
  readonly label = input('Cargando…');
}

@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    @use 'tokens' as *;

    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 0.5rem;
      padding: 2rem 1rem;
      text-align: center;
    }

    .empty__icon {
      display: inline-grid;
      place-items: center;
      width: 3.5rem;
      height: 3.5rem;
      margin-bottom: 0.25rem;
      border-radius: $radius-panel;
      background: $color-primary-soft;
      color: $color-primary;
    }
  `,
  template: `
    <span class="empty__icon"><app-icon [name]="icon()" [size]="26" variant="duotone" /></span>
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
        Solo lectura: tu rol no incluye «{{ description() }}». Si lo necesitas, pídelo a tu administrador.
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
  /** What the permission lets you do, in words: the permission code is not for the end user. */
  protected readonly description = computed(() => PERMISSION_DESCRIPTIONS[this.permission()]);
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
