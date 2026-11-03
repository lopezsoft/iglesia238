import { ChangeDetectionStrategy, Component, ElementRef, input, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DevLinkBoxComponent } from '../../../../shared/ui/dev-link-box.component';
import { IconComponent } from '../../../../shared/ui/icon.component';

/**
 * Shown after the registration: the sede is already active, but the manager's e-mail must be confirmed
 * before the app opens. In development, with no SMTP, the confirmation link is handed back here.
 */
@Component({
  selector: 'app-registration-done',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DevLinkBoxComponent, IconComponent, RouterLink],
  styleUrl: './registration-done.component.scss',
  template: `
    <div class="done">
      <span class="done__icon"><app-icon name="mail" [size]="28" /></span>
      <h2 #title class="done__title" tabindex="-1">Revisa tu correo para confirmar tu cuenta</h2>
      <p>
        Registramos la sede <strong>{{ congregationName() }}</strong> y quedó activa. Enviamos un enlace de
        confirmación a <strong>{{ email() }}</strong
        >.
      </p>
      <p class="alert done__notice" role="note">
        <app-icon name="lock" [size]="18" />
        <span>
          Puedes iniciar sesión desde ya, pero la aplicación permanece bloqueada hasta que confirmes tu correo.
        </span>
      </p>
      <p class="text-muted text-small">Revisa también la carpeta de correo no deseado.</p>
      @if (devVerificationLink(); as link) {
        <app-dev-link-box class="done__dev" [link]="link" />
      }
      <a class="btn btn--primary btn--lg" routerLink="/login">Ir a iniciar sesión</a>
    </div>
  `,
})
export class RegistrationDoneComponent {
  readonly congregationName = input.required<string>();
  readonly email = input.required<string>();
  readonly devVerificationLink = input<string | null>(null);

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');

  /** Moves focus to the title so keyboard and screen reader users land on the confirmation. */
  focus(): void {
    this.title().nativeElement.focus();
  }
}
