import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { EmptyStateComponent } from '../../shared/ui/feedback.components';

@Component({
  selector: 'app-not-found-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent, RouterLink, NgTemplateOutlet],
  styles: `
    :host {
      display: block;
      max-width: 36rem;
      margin: 4rem auto;
      padding: 0 1rem;
    }
  `,
  template: `
    <ng-template #content>
      <app-empty-state icon="search" title="Página no encontrada" description="La dirección no existe o cambió.">
        <a class="btn btn--primary" [routerLink]="homeLink() ?? '/'">Volver al inicio</a>
      </app-empty-state>
    </ng-template>

    @if (embedded()) {
      <div class="card"><ng-container [ngTemplateOutlet]="content" /></div>
    } @else {
      <main class="card"><ng-container [ngTemplateOutlet]="content" /></main>
    }
  `,
})
export default class NotFoundPage {
  /** Route data: true inside a layout that already has its <main> landmark. */
  // Component input binding sets absent route data to undefined: keep both optional.
  readonly embedded = input<boolean | undefined>(false);
  /** Route data: where "Volver al inicio" leads (the public pages go back to /apply). */
  readonly homeLink = input<string | undefined>('/');
}
