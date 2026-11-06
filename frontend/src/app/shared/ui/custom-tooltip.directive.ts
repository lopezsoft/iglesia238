import { DOCUMENT } from '@angular/common';
import {
  DestroyRef,
  Directive,
  ElementRef,
  Renderer2,
   computed,
  effect,
  inject,
  input,
} from '@angular/core';

export type TooltipPosition = 'auto' | 'top' | 'bottom' | 'left' | 'right';

const VIEWPORT_MARGIN_PX = 8;
const TOOLTIP_GAP_PX = 8;

let nextTooltipId = 0;

/**
 * Accessible floating tooltip that replaces the native HTML `title` attribute.
 * Renders in `document.body` with `position: fixed` so scroll or table containers never clip it.
 */
@Directive({
  selector: '[appCustomTooltip]',
  host: {
    '[attr.data-tooltip]': 'normalizedText()',
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(pointerenter)': 'onPointerEnter($event)',
    '(pointerleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
    '(mousedown)': 'hide()',
    '(click)': 'hide()',
    '(document:keydown.escape)': 'hide()',
    '(window:scroll)': 'hide()',
    '(window:resize)': 'hide()',
  },
})
export class CustomTooltipDirective {
  readonly text = input<string | null | undefined>(null, { alias: 'appCustomTooltip' });
  readonly position = input<TooltipPosition>('auto', { alias: 'appTooltipPosition' });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly renderer = inject(Renderer2);
  private readonly document = inject(DOCUMENT);
  private readonly destroyRef = inject(DestroyRef);

  private readonly tooltipId = `app-custom-tooltip-${++nextTooltipId}`;
  private tooltipElement: HTMLElement | null = null;

  protected readonly normalizedText = computed(() => {
    const raw = this.text()?.trim() ?? '';
    return raw.length > 0 ? raw : null;
  });

  constructor() {
    // Asegura que el elemento anfitrión nunca conserve un atributo nativo `title`.
    this.renderer.removeAttribute(this.host.nativeElement, 'title');

    effect(() => {
      const currentText = this.normalizedText();
      if (!this.tooltipElement) {
        return;
      }
      if (!currentText) {
        this.hide();
        return;
      }
      this.tooltipElement.textContent = currentText;
      this.updatePosition();
    });

    this.destroyRef.onDestroy(() => this.hide());
  }

  protected onPointerEnter(event: PointerEvent): void {
    if (event.pointerType === 'touch') {
      return;
    }
    this.show();
  }

  protected show(): void {
    const content = this.normalizedText();
    if (!content || !this.document.body) {
      return;
    }

    if (this.tooltipElement) {
      this.tooltipElement.textContent = content;
      this.updatePosition();
      return;
    }

    const element = this.renderer.createElement('div') as HTMLElement;
    this.renderer.setAttribute(element, 'id', this.tooltipId);
    this.renderer.setAttribute(element, 'role', 'tooltip');
    this.renderer.addClass(element, 'app-custom-tooltip');
    element.textContent = content;

    this.renderer.appendChild(this.document.body, element);
    this.tooltipElement = element;
    this.attachAriaDescribedBy();
    this.updatePosition();
  }

  protected hide(): void {
    if (!this.tooltipElement) {
      return;
    }
    this.detachAriaDescribedBy();
    this.tooltipElement.remove();
    this.tooltipElement = null;
  }

  private updatePosition(): void {
    if (!this.tooltipElement) {
      return;
    }

    const hostRect = this.host.nativeElement.getBoundingClientRect();
    const tooltipRect = this.tooltipElement.getBoundingClientRect();
    const viewportWidth = this.document.defaultView?.innerWidth ?? 1024;
    const viewportHeight = this.document.defaultView?.innerHeight ?? 768;

    const resolvedPlacement = this.resolvePlacement(hostRect, tooltipRect, viewportWidth, viewportHeight);
    this.renderer.setAttribute(this.tooltipElement, 'data-placement', resolvedPlacement);

    let top = 0;
    let left = 0;

    switch (resolvedPlacement) {
      case 'bottom':
        top = hostRect.bottom + TOOLTIP_GAP_PX;
        left = hostRect.left + (hostRect.width - tooltipRect.width) / 2;
        break;
      case 'left':
        top = hostRect.top + (hostRect.height - tooltipRect.height) / 2;
        left = hostRect.left - tooltipRect.width - TOOLTIP_GAP_PX;
        break;
      case 'right':
        top = hostRect.top + (hostRect.height - tooltipRect.height) / 2;
        left = hostRect.right + TOOLTIP_GAP_PX;
        break;
      case 'top':
      default:
        top = hostRect.top - tooltipRect.height - TOOLTIP_GAP_PX;
        left = hostRect.left + (hostRect.width - tooltipRect.width) / 2;
        break;
    }

    const maxLeft = Math.max(VIEWPORT_MARGIN_PX, viewportWidth - tooltipRect.width - VIEWPORT_MARGIN_PX);
    const maxTop = Math.max(VIEWPORT_MARGIN_PX, viewportHeight - tooltipRect.height - VIEWPORT_MARGIN_PX);
    const clampedLeft = Math.min(Math.max(VIEWPORT_MARGIN_PX, left), maxLeft);
    const clampedTop = Math.min(Math.max(VIEWPORT_MARGIN_PX, top), maxTop);

    this.renderer.setStyle(this.tooltipElement, 'top', `${Math.round(clampedTop)}px`);
    this.renderer.setStyle(this.tooltipElement, 'left', `${Math.round(clampedLeft)}px`);
  }

  private resolvePlacement(
    hostRect: DOMRect,
    tooltipRect: DOMRect,
    viewportWidth: number,
    viewportHeight: number,
  ): Exclude<TooltipPosition, 'auto'> {
    const requested = this.position();
    if (requested === 'top' || requested === 'bottom' || requested === 'left' || requested === 'right') {
      if (requested === 'right' && hostRect.right + TOOLTIP_GAP_PX + tooltipRect.width > viewportWidth - VIEWPORT_MARGIN_PX) {
        return hostRect.top - TOOLTIP_GAP_PX - tooltipRect.height >= VIEWPORT_MARGIN_PX ? 'top' : 'bottom';
      }
      if (requested === 'left' && hostRect.left - TOOLTIP_GAP_PX - tooltipRect.width < VIEWPORT_MARGIN_PX) {
        return hostRect.top - TOOLTIP_GAP_PX - tooltipRect.height >= VIEWPORT_MARGIN_PX ? 'top' : 'bottom';
      }
      if (requested === 'top' && hostRect.top - TOOLTIP_GAP_PX - tooltipRect.height < VIEWPORT_MARGIN_PX) {
        return 'bottom';
      }
      if (requested === 'bottom' && hostRect.bottom + TOOLTIP_GAP_PX + tooltipRect.height > viewportHeight - VIEWPORT_MARGIN_PX) {
        return 'top';
      }
      return requested;
    }

    if (hostRect.top - TOOLTIP_GAP_PX - tooltipRect.height >= VIEWPORT_MARGIN_PX) {
      return 'top';
    }
    return 'bottom';
  }

  private attachAriaDescribedBy(): void {
    const hostEl = this.host.nativeElement;
    const current = hostEl.getAttribute('aria-describedby')?.trim() ?? '';
    const tokens = current ? current.split(/\s+/) : [];
    if (!tokens.includes(this.tooltipId)) {
      tokens.push(this.tooltipId);
      this.renderer.setAttribute(hostEl, 'aria-describedby', tokens.join(' '));
    }
  }

  private detachAriaDescribedBy(): void {
    const hostEl = this.host.nativeElement;
    const current = hostEl.getAttribute('aria-describedby')?.trim() ?? '';
    if (!current) {
      return;
    }
    const remaining = current
      .split(/\s+/)
      .filter((token) => token !== this.tooltipId)
      .join(' ');
    if (remaining) {
      this.renderer.setAttribute(hostEl, 'aria-describedby', remaining);
    } else {
      this.renderer.removeAttribute(hostEl, 'aria-describedby');
    }
  }
}
