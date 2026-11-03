import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { IconComponent } from '../../../../shared/ui/icon.component';

/** Confirmation with the tracking code: the only way to follow the application later. */
@Component({
  selector: 'app-submission-confirmation',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, IconComponent],
  styleUrl: './submission-confirmation.component.scss',
  template: `
    <div class="confirmation">
      <span class="confirmation__icon"><app-icon name="check" [size]="28" /></span>
      <h3 #title class="confirmation__title" tabindex="-1">Recibimos tu solicitud</h3>
      <p class="text-muted">
        La secretaría de {{ congregationName() }} revisará tus datos. Guarda este código: lo necesitas
        para consultar el estado de tu solicitud.
      </p>
      <div class="confirmation__code">
        <span class="confirmation__code-text">
          <span class="text-muted text-small">Código de seguimiento</span>
          <span class="mono confirmation__value">{{ trackingCode() }}</span>
        </span>
        <button type="button" class="btn btn--secondary btn--sm" [attr.aria-label]="copyAriaLabel()" (click)="copy()">
          <app-icon [name]="copied() ? 'check' : 'copy'" [size]="16" />
          {{ copied() ? 'Copiado' : 'Copiar' }}
        </button>
      </div>
      <p class="text-small" aria-live="polite">{{ copyMessage() }}</p>
      <div class="cluster confirmation__actions">
        <a class="btn btn--primary" routerLink="/apply/status">Consultar el estado</a>
        <button type="button" class="btn btn--secondary" (click)="restart.emit()">Hacer otra solicitud</button>
      </div>
    </div>
  `,
})
export class SubmissionConfirmationComponent {
  readonly trackingCode = input.required<string>();
  readonly congregationName = input.required<string>();
  readonly restart = output<void>();

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  protected readonly copied = signal(false);
  protected readonly copyMessage = signal('');
  protected readonly copyAriaLabel = computed(() => `Copiar código de seguimiento ${this.trackingCode()}`);

  /** Moves focus to the title so keyboard and screen reader users land on the confirmation. */
  focus(): void {
    this.title().nativeElement.focus();
  }

  protected async copy(): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard API unavailable');
      }
      await navigator.clipboard.writeText(this.trackingCode());
      this.copied.set(true);
      this.copyMessage.set('Código copiado al portapapeles.');
    } catch {
      this.copied.set(false);
      this.copyMessage.set('No pudimos copiarlo automáticamente. Selecciona el código y cópialo a mano.');
    }
  }
}
