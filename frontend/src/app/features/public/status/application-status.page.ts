import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { StatusCheckComponent } from './components/status-check.component';

/** C-02: public page to follow an application with its tracking code. */
@Component({
  selector: 'app-application-status-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, StatusCheckComponent],
  styles: `
    @use 'tokens' as *;

    .status-page {
      display: flex;
      flex-direction: column;
      gap: $space-5;
      max-width: 36rem;
      margin: 0 auto;
    }

    .status-page__intro {
      display: flex;
      flex-direction: column;
      gap: $space-1;
    }
  `,
  template: `
    <div class="status-page">
      <header class="status-page__intro">
        <p class="text-muted text-small">Inscripción pública · Sin cuenta</p>
        <h1>Consultar el estado de mi solicitud</h1>
        <p class="text-muted">Escribe el código que recibiste al enviar tu solicitud de membresía.</p>
      </header>
      <section class="card" aria-label="Consulta por código de seguimiento">
        <app-status-check />
      </section>
      <p class="text-muted">
        ¿Aún no has enviado tu solicitud? <a routerLink="/apply">Inscríbete aquí</a>.
      </p>
    </div>
  `,
})
export class ApplicationStatusPage {}
