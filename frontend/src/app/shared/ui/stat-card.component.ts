import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent, IconName } from './icon.component';
import { ChipTone } from './icon-chip.component';

/**
 * KPI card: tinted icon, optional comparison pill, the figure, its label and an optional
 * footer ("vs. ayer" and the previous value). With `link` the whole card navigates. `hint`
 * keeps working as a note under the label for the screens written before the redesign.
 */
@Component({
  selector: 'app-stat-card',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent, NgTemplateOutlet, RouterLink],
  styleUrl: './stat-card.component.scss',
  template: `
    <ng-template #body>
      @if (icon() || comparison()) {
        <span class="stat__top">
          @if (icon(); as name) {
            <span class="stat__chip"><app-icon [name]="name" [size]="20" variant="duotone" /></span>
          }
          @if (comparison()) {
            <span class="stat__comparison">{{ comparison() }}</span>
          }
        </span>
      }
      <span class="stat__value">{{ value() }}</span>
      <span class="stat__label">{{ label() }}</span>
      @if (hint()) {
        <span class="stat__hint">{{ hint() }}</span>
      }
      @if (hasFooter()) {
        <span class="stat__footer">
          <span class="stat__footer-label">{{ compareLabel() }}</span>
          <span class="stat__footer-value">{{ compareValue() }}</span>
        </span>
      }
    </ng-template>
    @if (link(); as target) {
      <a class="stat stat--link" [class]="classes()" [routerLink]="target" [attr.aria-current]="active() ? 'true' : null">
        <ng-container [ngTemplateOutlet]="body" />
      </a>
    } @else {
      <div class="stat" [class]="classes()">
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
  /** Color of the icon chip. */
  readonly tone = input<ChipTone>('slate');
  /** Text of the pill at the top right: "+12 %", "Sin comparativo". */
  readonly comparison = input<string | null>(null);
  /** Footer: "vs. ayer" on the left and the previous value on the right. */
  readonly compareLabel = input<string | null>(null);
  readonly compareValue = input<string | number | null>(null);
  /** Marks the card as the selected one (bottom bar). */
  readonly active = input(false);

  protected readonly hasFooter = computed(() => this.compareLabel() !== null && this.compareValue() !== null);
  protected readonly classes = computed(() => `tone-${this.tone()}${this.active() ? ' is-active' : ''}`);
}
