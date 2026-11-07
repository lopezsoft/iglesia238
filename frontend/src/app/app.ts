import { ChangeDetectionStrategy, Component, afterNextRender, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { VersionUpdateService } from './core/version/version-update.service';

@Component({
  selector: 'app-root',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  template: '<router-outlet />',
})
export class App {
  private readonly versionUpdate = inject(VersionUpdateService);

  constructor() {
    afterNextRender(() => {
      this.versionUpdate.startMonitoring();
    });
  }
}
