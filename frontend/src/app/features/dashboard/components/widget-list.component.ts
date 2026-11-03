import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../shared/ui/icon.component';
import { ListItem, ListWidget } from '../data/dashboard.models';
import { widgetIcon } from '../data/widget-icons';

const BADGE_CLASSES: Readonly<Record<string, string>> = {
  green: 'badge--success',
  orange: 'badge--warning',
  red: 'badge--danger',
  indigo: 'badge--indigo',
  cyan: 'badge--cyan',
  slate: 'badge--info',
};

/** Card with the latest items of an area (audit entries, pending requests…), from a `lists` widget. */
@Component({
  selector: 'app-widget-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, RouterLink],
  styleUrl: './dashboard-widget.scss',
  template: `
    <section class="card card--flush" [attr.aria-labelledby]="'widget-' + widget().key">
      <header class="widget__header">
        <div class="widget__heading">
          <span class="panel-badge" [class]="'tone-' + widget().tone">
            <app-icon [name]="icon(widget().icon)" [size]="18" variant="duotone" />
          </span>
          <div>
            <h2 [id]="'widget-' + widget().key">{{ widget().title }}</h2>
            @if (widget().subtitle) {
              <p class="text-muted text-small">{{ widget().subtitle }}</p>
            }
          </div>
        </div>
      </header>

      @if (widget().items.length === 0) {
        <p class="widget__empty text-muted">{{ widget().emptyText }}</p>
      } @else {
        <ul class="widget__list">
          @for (item of widget().items; track item.id) {
            <li class="widget__row">
              <span class="widget__avatar" aria-hidden="true">
                <app-icon [name]="icon(widget().icon)" [size]="16" />
              </span>
              <div class="widget__main">
                <p class="widget__name">{{ item.title }}</p>
                @if (item.subtitle) {
                  <p class="text-muted text-small">{{ item.subtitle }}</p>
                }
              </div>
              @if (item.badge; as badge) {
                <span class="badge" [class]="badgeClass(badge.tone)">{{ badge.label }}</span>
              }
              @if (item.occurredAt) {
                <time class="text-muted text-small widget__time" [attr.datetime]="item.occurredAt">{{
                  item.occurredAt | date: 'dd/MM/yyyy HH:mm'
                }}</time>
              }
            </li>
          }
        </ul>
      }

      @if (widget().link; as link) {
        <footer class="widget__footer">
          <span></span>
          <a [routerLink]="link" class="widget__more">
            {{ widget().linkLabel ?? 'Ver todo' }} <app-icon name="chevron-right" [size]="16" />
          </a>
        </footer>
      }
    </section>
  `,
})
export class WidgetListComponent {
  readonly widget = input.required<ListWidget>();

  protected readonly icon = widgetIcon;

  protected badgeClass(tone: NonNullable<ListItem['badge']>['tone']): string {
    return BADGE_CLASSES[tone] ?? '';
  }
}
