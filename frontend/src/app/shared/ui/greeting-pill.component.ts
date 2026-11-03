import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { IconComponent, IconName } from './icon.component';

/** Time-of-day greeting in a pill ("Buenos días", "Buenas tardes", "Buenas noches"). */
@Component({
  selector: 'app-greeting-pill',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    @use 'tokens' as *;

    :host {
      display: inline-flex;
      align-items: center;
      gap: $space-2;
      padding: $space-1 + 0.125rem $space-3;
      border-radius: $radius-pill;
      background: $color-primary-soft;
      color: $color-primary-strong;
      font-size: $font-size-xs;
      font-weight: $font-weight-bold;
    }
  `,
  template: `<app-icon [name]="greeting().icon" [size]="14" />{{ greeting().text }}`,
})
export class GreetingPillComponent {
  protected readonly greeting = computed<{ text: string; icon: IconName }>(() => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return { text: 'Buenos días', icon: 'sun' };
    }
    return hour < 19 ? { text: 'Buenas tardes', icon: 'cloud-sun' } : { text: 'Buenas noches', icon: 'moon' };
  });
}
