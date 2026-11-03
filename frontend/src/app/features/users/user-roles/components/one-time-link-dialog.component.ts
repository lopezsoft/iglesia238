import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  effect,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { OneTimeLink } from '../data/user-roles.models';

/**
 * Shows the one-time link of an invitation or a recovery to the administrator who generated it.
 * The API never stores it in clear text, so closing this dialog is the last chance to copy it.
 */
@Component({
  selector: 'app-one-time-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, DialogComponent, IconComponent],
  styles: `
    @use 'tokens' as *;

    .link-box {
      display: flex;
      gap: $space-2;
      align-items: stretch;
    }

    .link-box .input {
      flex: 1;
      min-width: 0;
      font-family: $font-mono;
      font-size: $font-size-xs;
    }
  `,
  template: `
    <app-dialog [(open)]="open" [title]="title()">
      @if (link(); as current) {
        <div class="stack">
          @if (current.emailDelivered) {
            <div class="alert alert--success">
              <app-icon name="mail" />
              <span>
                También enviamos el enlace al correo de <strong>{{ recipient() }}</strong
                >. Si no le llega, puedes compartirle este.
              </span>
            </div>
          } @else {
            <div class="alert alert--warning">
              <app-icon name="alert" />
              <span>
                El correo no está configurado o no pudo enviarse: copia el enlace y compártelo con
                <strong>{{ recipient() }}</strong> por un canal seguro (WhatsApp o en persona).
              </span>
            </div>
          }

          <div class="field">
            <label for="one-time-link">
              {{ current.purpose === 'INVITATION' ? 'Enlace de invitación' : 'Enlace para crear una contraseña nueva' }}
            </label>
            <div class="link-box">
              <input
                #linkInput
                id="one-time-link"
                class="input"
                type="text"
                readonly
                [value]="current.link"
                (focus)="select()"
              />
              <button type="button" class="btn btn--primary" (click)="copy()">
                <app-icon [name]="copied() ? 'check' : 'copy'" />
                <span>{{ copied() ? 'Copiado' : 'Copiar enlace' }}</span>
              </button>
            </div>
            <span class="field__hint" aria-live="polite">
              @if (copyFailed()) {
                No pudimos copiarlo automáticamente: ya quedó seleccionado, usa Ctrl+C.
              } @else {
                Funciona una sola vez y vence el {{ current.expiresAt | date: "dd/MM/yyyy 'a las' HH:mm" }}.
              }
            </span>
          </div>

          <p class="text-muted text-small">
            Por seguridad no guardamos el enlace: no se vuelve a mostrar. Si se pierde, genera uno
            nuevo desde el panel del usuario; el anterior queda sin efecto.
          </p>
        </div>
      }
      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Listo</button>
      </div>
    </app-dialog>
  `,
})
export class OneTimeLinkDialogComponent {
  readonly open = model(false);
  readonly link = input<OneTimeLink | null>(null);
  /** Name or e-mail of the person the link is for. */
  readonly recipient = input('');

  private readonly document = inject(DOCUMENT);
  private readonly linkInput = viewChild<ElementRef<HTMLInputElement>>('linkInput');

  protected readonly copied = signal(false);
  protected readonly copyFailed = signal(false);
  protected readonly title = computed(() =>
    this.link()?.purpose === 'PASSWORD_RESET' ? 'Enlace de recuperación' : 'Enlace de invitación',
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        this.copied.set(false);
        this.copyFailed.set(false);
      }
    });
  }

  protected select(): void {
    this.linkInput()?.nativeElement.select();
  }

  protected async copy(): Promise<void> {
    const current = this.link();
    if (!current) {
      return;
    }
    this.copyFailed.set(false);
    try {
      await this.document.defaultView?.navigator.clipboard.writeText(current.link);
      this.copied.set(true);
    } catch {
      // No clipboard permission or insecure context: leave the text selected for Ctrl+C.
      this.select();
      this.copyFailed.set(true);
    }
  }
}
