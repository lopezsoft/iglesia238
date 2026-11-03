import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { EmptyStateComponent } from '../../shared/ui/feedback.components';

@Component({
  selector: 'app-forbidden-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [EmptyStateComponent, RouterLink],
  template: `
    <div class="card">
      <app-empty-state
        icon="lock"
        title="No tienes acceso a este módulo"
        [description]="'Tu rol en ' + (scope()?.label ?? 'este alcance') + ' no incluye el permiso necesario. Si crees que es un error, pídelo al administrador de tu denominación.'"
      >
        <a class="btn btn--primary" routerLink="/dashboard">Ir al inicio</a>
      </app-empty-state>
    </div>
  `,
})
export default class ForbiddenPage {
  protected readonly scope = inject(AuthService).activeScope;
}
