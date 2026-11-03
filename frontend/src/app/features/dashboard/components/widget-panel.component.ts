import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MiniStatComponent } from '../../../shared/ui/mini-stat.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import { PanelWidget } from '../data/dashboard.models';
import { formatWidgetValue } from '../data/widget-format';
import { widgetIcon } from '../data/widget-icons';

/** A tinted panel with a grid of figures, built from a `panels` widget of the API. */
@Component({
  selector: 'app-widget-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MiniStatComponent, RouterLink, SectionPanelComponent],
  template: `
    <app-section-panel
      [title]="widget().title"
      [subtitle]="widget().subtitle"
      [icon]="icon(widget().icon)"
      [tone]="widget().tone"
    >
      @if (widget().link; as link) {
        <a panel-actions class="btn btn--secondary btn--sm" [routerLink]="link">
          {{ widget().linkLabel ?? 'Ver detalle' }}
        </a>
      }
      @for (stat of widget().stats; track stat.key) {
        <app-mini-stat
          [label]="stat.label"
          [value]="format(stat.value, stat.format)"
          [meta]="stat.meta"
          [icon]="icon(stat.icon)"
          [tone]="stat.tone"
        />
      }
    </app-section-panel>
  `,
})
export class WidgetPanelComponent {
  readonly widget = input.required<PanelWidget>();

  protected readonly icon = widgetIcon;
  protected readonly format = formatWidgetValue;
}
