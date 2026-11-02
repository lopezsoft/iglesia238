import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Breadcrumb, title, description and the page actions (projected content). */
@Component({
  selector: 'app-page-header',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './page-header.component.scss',
  template: `
    <header class="page-header">
      <div class="page-header__text">
        @if (breadcrumb()) {
          <p class="page-header__breadcrumb">{{ breadcrumb() }}</p>
        }
        <h1>{{ title() }}</h1>
        @if (description()) {
          <p class="page-header__description">{{ description() }}</p>
        }
      </div>
      <div class="page-header__actions">
        <ng-content />
      </div>
    </header>
  `,
})
export class PageHeaderComponent {
  readonly title = input.required<string>();
  readonly description = input<string | null>(null);
  readonly breadcrumb = input<string | null>(null);
}
