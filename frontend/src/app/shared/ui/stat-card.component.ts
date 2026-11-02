import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, IconName } from './icon.component';

/** KPI card. With `link` the whole card navigates. */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, NgTemplateOutlet, RouterLink],
  styleUrl: './stat-card.component.scss',
  template: `
    <ng-template #body>
      <span class="stat__label">
        @if (icon(); as name) {
          <app-icon [name]="name" />
        }
        {{ label() }}
      </span>
      <span class="stat__value">{{ value() }}</span>
      @if (hint()) {
        <span class="stat__hint">{{ hint() }}</span>
      }
    </ng-template>
    @if (link(); as target) {
      <a class="stat stat--link" [routerLink]="target">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <div class="stat">
        <ng-container [ngTemplateOutlet]="body" />
      </div>
    }
  `,
})
export class StatCardComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string | null>(null);
  readonly icon = input<IconName | null>(null);
  readonly link = input<string | null>(null);
}
