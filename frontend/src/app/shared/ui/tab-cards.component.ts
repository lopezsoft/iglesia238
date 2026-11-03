import { ChangeDetectionStrategy, Component, ElementRef, input, model, viewChildren } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

export interface TabCardItem<T extends string = string> {
  readonly id: T;
  readonly title: string;
  readonly subtitle?: string;
  readonly icon: IconName;
}

/**
 * Top-level sections of a module as cards ("General", "Indicadores"). `tablist` semantics with
 * arrow keys; the selected card shows a border, tint and bottom bar. Give each panel
 * `role="tabpanel"`, `id="<idPrefix>-panel-<id>"` and `aria-labelledby="<idPrefix>-tab-<id>"`.
 * For dense sub-tabs inside a page use the `.tabs` class instead.
 */
@Component({
  selector: 'app-tab-cards',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styleUrl: './tab-cards.component.scss',
  template: `
    <div class="tab-cards" role="tablist" [attr.aria-label]="ariaLabel()">
      @for (item of items(); track item.id) {
        <button
          #tab
          type="button"
          role="tab"
          class="tab-card"
          [id]="idPrefix() + '-tab-' + item.id"
          [attr.aria-selected]="item.id === selected()"
          [attr.aria-controls]="item.id === selected() ? idPrefix() + '-panel-' + item.id : null"
          [tabindex]="item.id === selected() ? 0 : -1"
          (click)="selected.set(item.id)"
          (keydown.arrowright)="move($event, 1)"
          (keydown.arrowleft)="move($event, -1)"
          (keydown.home)="moveTo($event, 0)"
          (keydown.end)="moveTo($event, items().length - 1)"
        >
          <span class="tab-card__chip"><app-icon [name]="item.icon" [size]="18" [variant]="item.id === selected() ? 'duotone' : 'line'" /></span>
          <span class="tab-card__text">
            <span class="tab-card__title">{{ item.title }}</span>
            @if (item.subtitle) {
              <span class="tab-card__subtitle">{{ item.subtitle }}</span>
            }
          </span>
        </button>
      }
    </div>
  `,
})
export class TabCardsComponent {
  readonly items = input.required<readonly TabCardItem[]>();
  readonly selected = model.required<string>();
  readonly ariaLabel = input.required<string>();
  readonly idPrefix = input('tabcard');

  private readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');

  protected move(event: Event, delta: number): void {
    const count = this.items().length;
    const current = this.items().findIndex((item) => item.id === this.selected());
    this.moveTo(event, (current + delta + count) % count);
  }

  protected moveTo(event: Event, index: number): void {
    event.preventDefault();
    const target = this.items()[index];
    if (target) {
      this.selected.set(target.id);
      this.tabs()[index]?.nativeElement.focus();
    }
  }
}
