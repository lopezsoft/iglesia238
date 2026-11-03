import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, inject, signal } from '@angular/core';
import { ApiStatusService } from '../core/http/api-status.service';
import { IconComponent } from '../shared/ui/icon.component';

const RECHECK_MS = 60_000;

/**
 * Round icon buttons of the top bar: API connectivity (live), reload the page data and full
 * screen. There are no notification or help buttons until the API has something to show.
 */
@Component({
  selector: 'app-status-cluster',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  host: { '(document:fullscreenchange)': 'syncFullscreen()' },
  styleUrl: './status-cluster.component.scss',
  template: `
    <div class="cluster-pill" role="group" aria-label="Estado y acciones rápidas">
      <button
        type="button"
        class="cluster-pill__button"
        [class.is-online]="status() === 'online'"
        [class.is-offline]="status() === 'offline'"
        [attr.aria-label]="statusText()"
        [attr.title]="statusText()"
        (click)="recheck()"
      >
        <app-icon name="wifi" [size]="18" />
      </button>
      <button type="button" class="cluster-pill__button" aria-label="Actualizar datos" title="Actualizar datos" (click)="reload()">
        <app-icon name="refresh" [size]="18" />
      </button>
      <button
        type="button"
        class="cluster-pill__button cluster-pill__button--optional"
        [attr.aria-label]="fullscreen() ? 'Salir de pantalla completa' : 'Pantalla completa'"
        [attr.title]="fullscreen() ? 'Salir de pantalla completa' : 'Pantalla completa'"
        [attr.aria-pressed]="fullscreen()"
        (click)="toggleFullscreen()"
      >
        <app-icon [name]="fullscreen() ? 'minimize' : 'maximize'" [size]="18" />
      </button>
    </div>
    <span class="visually-hidden" role="status" aria-live="polite">{{ statusText() }}</span>
  `,
})
export class StatusClusterComponent implements OnInit {
  private readonly api = inject(ApiStatusService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly status = this.api.status;
  protected readonly fullscreen = signal(false);
  protected readonly statusText = computed(() => {
    switch (this.status()) {
      case 'online':
        return 'Conectado con el servidor';
      case 'offline':
        return 'Sin conexión con el servidor. Toca para reintentar';
      default:
        return 'Comprobando la conexión con el servidor';
    }
  });

  ngOnInit(): void {
    void this.api.check();
    const timer = setInterval(() => {
      if (!document.hidden) {
        void this.api.check();
      }
    }, RECHECK_MS);
    this.destroyRef.onDestroy(() => clearInterval(timer));
  }

  protected recheck(): void {
    void this.api.check();
  }

  /** Reloads the page: the session returns through the refresh cookie and every screen reloads its data. */
  protected reload(): void {
    window.location.reload();
  }

  protected syncFullscreen(): void {
    this.fullscreen.set(document.fullscreenElement !== null);
  }

  protected async toggleFullscreen(): Promise<void> {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // The browser refused (policy or unsupported): nothing to do.
    }
  }
}
