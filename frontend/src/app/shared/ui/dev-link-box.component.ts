import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { IconComponent } from './icon.component';

let nextId = 0;

/**
 * Development-only box shown when the API could not send the confirmation e-mail because SMTP is not
 * configured: it hands the one-time link back so the flow can be completed by hand. Production answers
 * never carry that link, so the box never shows there.
 */
@Component({
  selector: 'app-dev-link-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styles: `
    @use 'tokens' as *;

    :host {
      display: block;
    }

    .dev-box {
      display: flex;
      flex-direction: column;
      gap: $space-2;
      padding: $space-3 $space-4;
      border: 1px dashed $color-warning;
      border-radius: $radius-control;
      background: $color-warning-soft;
      text-align: left;
    }

    .dev-box__title {
      display: flex;
      align-items: center;
      gap: $space-2;
      font-size: $font-size-sm;
      font-weight: $font-weight-bold;
    }

    .dev-box__link {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
    }

    .dev-box__link .input {
      flex: 1 1 14rem;
      min-width: 0;
      font-family: $font-mono;
      font-size: $font-size-xs;
    }
  `,
  template: `
    <section class="dev-box" [attr.aria-labelledby]="titleId">
      <h2 class="dev-box__title" [id]="titleId">
        <app-icon name="alert" [size]="18" />
        Modo desarrollo: SMTP no configurado
      </h2>
      <p class="text-small">
        El servidor no pudo enviar el correo. Abre o copia este enlace para confirmar la cuenta; solo aparece
        en desarrollo.
      </p>
      <div class="dev-box__link">
        <input
          #linkInput
          class="input"
          type="text"
          readonly
          aria-label="Enlace de confirmación"
          [value]="link()"
          (focus)="select()"
        />
        <a class="btn btn--secondary" [href]="link()">
          <app-icon name="link" [size]="16" />
          Abrir enlace
        </a>
        <button type="button" class="btn btn--secondary" (click)="copy()">
          <app-icon [name]="copied() ? 'check' : 'copy'" [size]="16" />
          {{ copied() ? 'Copiado' : 'Copiar enlace' }}
        </button>
      </div>
      <p class="text-small" role="status" aria-live="polite">
        @if (copyFailed()) {
          No pudimos copiarlo automáticamente: ya quedó seleccionado, usa Ctrl+C.
        }
      </p>
    </section>
  `,
})
export class DevLinkBoxComponent {
  readonly link = input.required<string>();

  private readonly document = inject(DOCUMENT);
  private readonly linkInput = viewChild.required<ElementRef<HTMLInputElement>>('linkInput');

  protected readonly titleId = `app-dev-link-title-${nextId++}`;
  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);

  protected select(): void {
    this.linkInput().nativeElement.select();
  }

  protected async copy(): Promise<void> {
    this.copyFailed.set(false);
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(this.link());
      this.copied.set(true);
    } catch {
      // No clipboard permission or insecure context: leave the text selected for Ctrl+C.
      this.select();
      this.copied.set(false);
      this.copyFailed.set(true);
    }
  }
}
