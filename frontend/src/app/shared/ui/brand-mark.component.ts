import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * Isotipo de Iglesia 238: tile con degradado y "casa-escudo" recortada (puerta en arco).
 * `sede` lleva la cruz; `simple` una ventana circular (para contextos multi-denominación).
 * Los archivos fuente viven en `public/brand/` (ver `public/brand/preview.html`).
 */
export type BrandMarkVariant = 'sede' | 'simple';

const HOUSE = 'M32 12.5 L50.5 26.5 V47 a4 4 0 0 1 -4 4 H17.5 a4 4 0 0 1 -4 -4 V26.5 Z';
const DOOR = 'M26 51 V39.5 a6 6 0 0 1 12 0 V51 Z';
const CROSS = 'M30.6 19.5 H33.4 V23 H36.8 V25.8 H33.4 V31 H30.6 V25.8 H27.2 V23 H30.6 Z';
const WINDOW = 'M32 21.5 a3.2 3.2 0 1 0 0.01 0 Z';

const MARK_PATHS: Record<BrandMarkVariant, string> = {
  sede: `${HOUSE} ${DOOR} ${CROSS}`,
  simple: `${HOUSE} ${DOOR} ${WINDOW}`,
};

let nextGradientId = 0;

/** Decorative by default; pass `label` when the mark stands alone (e.g. without the wordmark next to it). */
@Component({
  selector: 'app-brand-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'app-brand-mark' },
  styles: `
    @use 'tokens' as *;

    :host {
      display: inline-flex;
      flex-shrink: 0;
      line-height: 0;
    }

    .brand-mark__from {
      stop-color: $brand-mark-from;
    }

    .brand-mark__to {
      stop-color: $brand-mark-to;
    }

    .brand-mark__house {
      fill: $color-on-brand;
    }
  `,
  template: `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      [attr.width]="size()"
      [attr.height]="size()"
      [attr.aria-hidden]="label() ? null : 'true'"
      [attr.role]="label() ? 'img' : null"
      [attr.aria-label]="label()"
      focusable="false"
    >
      <defs>
        <linearGradient [attr.id]="gradientId" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="64" y2="64">
          <stop class="brand-mark__from" offset="0" />
          <stop class="brand-mark__to" offset="1" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="15" [attr.fill]="gradientFill" />
      <path class="brand-mark__house" fill-rule="evenodd" [attr.d]="path()" />
    </svg>
  `,
})
export class BrandMarkComponent {
  readonly size = input(40);
  readonly variant = input<BrandMarkVariant>('sede');
  readonly label = input<string | null>(null);

  /** Unique per instance so several marks on one page never share a gradient definition. */
  protected readonly gradientId = `brand-mark-gradient-${nextGradientId++}`;
  protected readonly gradientFill = `url(#${this.gradientId})`;
  protected readonly path = computed(() => MARK_PATHS[this.variant()]);
}
