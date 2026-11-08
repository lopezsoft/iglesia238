import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { userMessage } from '../../../core/errors/domain-error';
import { brandingFileUrl } from '../../../shared/utils/branding-url';
import { Branding } from './data/branding.models';
import { BrandingRepository } from './data/branding.repository';
import { colorProblem, isHexColor } from './data/color';
import { fileToBase64, logoFileProblem } from './data/logo-file';

/** The denomination chooses the logo and the color of its documents (certificates, cards and reports). */
@Component({
  selector: 'app-branding-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `
    @use 'tokens' as *;

    .branding {
      display: grid;
      gap: $space-5;
      grid-template-columns: minmax(0, 1fr);
      max-width: 48rem;
    }

    .branding__current {
      display: flex;
      align-items: center;
      gap: $space-4;
      flex-wrap: wrap;
    }

    .branding__logo {
      max-width: 12rem;
      max-height: 6rem;
      object-fit: contain;
      border: 1px solid $color-border;
      border-radius: $radius-control;
      padding: $space-2;
      background: $color-surface;
    }

    .branding__actions {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
      align-items: center;
    }

    .branding__color {
      display: flex;
      align-items: center;
      gap: $space-3;
      flex-wrap: wrap;
    }

    .branding__color input[type='color'] {
      width: 3rem;
      height: 2.5rem;
      padding: 0;
      border: 1px solid $color-border;
      border-radius: $radius-control;
      background: none;
    }

    .branding__sample {
      display: flex;
      align-items: center;
      gap: $space-4;
      padding: $space-4;
      border: 1px solid $color-border;
      border-top-width: 4px;
      border-radius: $radius-control;
      background: $color-surface;
    }

    .branding__sample-name {
      margin: 0;
      font-weight: $font-weight-semibold;
    }
  `,
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Identidad visual</h1>
        <p class="text-muted">
          El logo y el color con los que se imprimen los certificados, los carnés y los reportes de
          tu denominación. Los certificados ya expedidos conservan el logo y el color con los que se
          imprimieron.
        </p>
      </header>

      @if (loading()) {
        <p class="text-muted" aria-live="polite">Cargando…</p>
      } @else if (loadError(); as message) {
        <p class="alert alert--danger" role="alert">{{ message }}</p>
      } @else if (branding(); as current) {
        <div class="branding">
          @if (notice(); as message) {
            <p class="alert alert--success" role="status">{{ message }}</p>
          }
          @if (actionError(); as message) {
            <p class="alert alert--danger" role="alert">{{ message }}</p>
          }

          <section class="card stack" aria-labelledby="logo-title">
            <h2 id="logo-title">Logo</h2>
            <div class="branding__current">
              @if (currentLogoUrl(); as url) {
                <img
                  class="branding__logo"
                  [src]="url"
                  [alt]="'Logo actual de ' + current.denominationName"
                />
              } @else {
                <p class="text-muted">Aún no hay logo: los documentos usan el ícono por defecto.</p>
              }
            </div>

            <div class="field">
              <label for="logo-file">Subir un logo nuevo</label>
              <input
                id="logo-file"
                class="input"
                type="file"
                accept="image/png,image/jpeg"
                aria-describedby="logo-help"
                [disabled]="busy()"
                (change)="onFile($event)"
              />
              <span id="logo-help" class="field__hint">
                PNG o JPEG, máximo {{ maxKilobytes() }} KB y entre
                {{ current.limits.logoMinDimension }} y {{ current.limits.logoMaxDimension }}
                píxeles por lado. Un fondo transparente (PNG) se ve mejor sobre el papel.
              </span>
              @if (fileProblem(); as message) {
                <span class="field__error" role="alert">{{ message }}</span>
              }
            </div>

            @if (pendingUrl(); as url) {
              <div class="branding__current">
                <img class="branding__logo" [src]="url" alt="Vista previa del logo nuevo" />
                <div class="branding__actions">
                  <button
                    type="button"
                    class="btn btn--primary"
                    [disabled]="busy()"
                    (click)="saveLogo()"
                  >
                    Guardar logo
                  </button>
                  <button
                    type="button"
                    class="btn btn--secondary"
                    [disabled]="busy()"
                    (click)="clearPending()"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            }

            @if (current.logoKey) {
              <div class="branding__actions">
                <button
                  type="button"
                  class="btn btn--secondary"
                  [disabled]="busy()"
                  (click)="removeLogo()"
                >
                  Quitar el logo
                </button>
              </div>
            }
          </section>

          <section class="card stack" aria-labelledby="color-title">
            <h2 id="color-title">Color institucional</h2>
            <div class="field">
              <label for="brand-color-text">Color (#RRGGBB)</label>
              <div class="branding__color">
                <input
                  id="brand-color-picker"
                  type="color"
                  aria-label="Elegir el color con el selector"
                  [value]="pickerValue()"
                  [disabled]="busy()"
                  (input)="onPicker($event)"
                />
                <input
                  id="brand-color-text"
                  class="input mono"
                  type="text"
                  maxlength="7"
                  autocomplete="off"
                  spellcheck="false"
                  placeholder="{{ current.defaultColor }}"
                  aria-describedby="color-help"
                  [value]="colorText()"
                  [disabled]="busy()"
                  (input)="onColorText($event)"
                />
              </div>
              <span id="color-help" class="field__hint">
                Vacío usa el azul por defecto. Debe ser lo bastante oscuro para que el texto se lea
                sobre papel blanco (contraste mínimo {{ current.limits.minContrast }}:1).
              </span>
              @if (problem(); as message) {
                <span class="field__error" role="alert">{{ message }}</span>
              }
            </div>
            <div class="branding__actions">
              <button
                type="button"
                class="btn btn--primary"
                [disabled]="busy() || problem() !== null || !colorChanged()"
                (click)="saveColor()"
              >
                Guardar color
              </button>
              <button
                type="button"
                class="btn btn--secondary"
                [disabled]="busy() || (colorText() === '' && current.primaryColor === null)"
                (click)="useDefaultColor()"
              >
                Usar el color por defecto
              </button>
            </div>
          </section>

          <section class="card stack" aria-labelledby="sample-title">
            <h2 id="sample-title">Así se verá el membrete</h2>
            <div class="branding__sample" [style.border-top-color]="sampleColor()">
              @if (sampleLogoUrl(); as url) {
                <img class="branding__logo" [src]="url" alt="" />
              }
              <p class="branding__sample-name" [style.color]="sampleColor()">
                {{ current.denominationName }}
              </p>
            </div>
          </section>
        </div>
      }
    </div>
  `,
})
export class BrandingPage implements OnInit {
  private readonly repository = inject(BrandingRepository);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly branding = signal<Branding | null>(null);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly fileProblem = signal<string | null>(null);
  private readonly pendingFile = signal<File | null>(null);
  protected readonly pendingUrl = signal<string | null>(null);

  protected readonly colorText = signal('');

  protected readonly maxKilobytes = computed(() =>
    Math.round((this.branding()?.limits.logoMaxBytes ?? 0) / 1024),
  );
  protected readonly currentLogoUrl = computed(() => {
    const key = this.branding()?.logoKey;
    return key ? brandingFileUrl(key) : null;
  });
  protected readonly problem = computed(() =>
    colorProblem(this.colorText(), this.branding()?.limits.minContrast ?? 4.5),
  );
  protected readonly colorChanged = computed(
    () => this.colorText().trim().toLowerCase() !== (this.branding()?.primaryColor ?? ''),
  );
  /** The color input needs a valid #RRGGBB: the default color stands in while the text is blank or invalid. */
  protected readonly pickerValue = computed(() => {
    const text = this.colorText().trim();
    return isHexColor(text) ? text.toLowerCase() : (this.branding()?.defaultColor ?? '#000000');
  });
  /** The color the sample shows: the one being typed if it is acceptable, otherwise the saved one. */
  protected readonly sampleColor = computed(() => {
    const text = this.colorText().trim();
    const saved = this.branding()?.primaryColor ?? this.branding()?.defaultColor ?? '';
    if (text === '') {
      return this.branding()?.defaultColor ?? saved;
    }
    return this.problem() === null && isHexColor(text) ? text.toLowerCase() : saved;
  });
  /** The pending logo if there is one, otherwise the saved one. */
  protected readonly sampleLogoUrl = computed(() => this.pendingUrl() ?? this.currentLogoUrl());

  constructor() {
    this.destroyRef.onDestroy(() => this.releasePendingUrl());
  }

  async ngOnInit(): Promise<void> {
    try {
      this.adopt(await firstValueFrom(this.repository.get()));
    } catch (error) {
      this.loadError.set(userMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.item(0) ?? null;
    this.notice.set(null);
    this.actionError.set(null);
    this.clearPending();
    if (!file) {
      return;
    }
    const limits = this.branding()?.limits;
    const problem = limits ? logoFileProblem(file, limits) : null;
    if (problem) {
      this.fileProblem.set(problem);
      input.value = '';
      return;
    }
    this.pendingFile.set(file);
    this.pendingUrl.set(URL.createObjectURL(file));
  }

  protected clearPending(): void {
    this.releasePendingUrl();
    this.pendingFile.set(null);
    this.pendingUrl.set(null);
    this.fileProblem.set(null);
    const input = document.getElementById('logo-file') as HTMLInputElement | null;
    if (input) {
      input.value = '';
    }
  }

  protected async saveLogo(): Promise<void> {
    const file = this.pendingFile();
    if (!file) {
      return;
    }
    await this.run(
      async () => this.repository.uploadLogo(await fileToBase64(file)),
      'Logo guardado. Se usará en los documentos nuevos.',
    );
    this.clearPending();
  }

  protected async removeLogo(): Promise<void> {
    await this.run(() => this.repository.removeLogo(), 'Logo quitado.');
  }

  protected onColorText(event: Event): void {
    this.colorText.set((event.target as HTMLInputElement).value);
  }

  protected onPicker(event: Event): void {
    this.colorText.set((event.target as HTMLInputElement).value);
  }

  protected async saveColor(): Promise<void> {
    const text = this.colorText().trim();
    await this.run(
      () => this.repository.updateColor(text === '' ? null : text),
      'Color guardado. Se usará en los documentos nuevos.',
    );
  }

  protected async useDefaultColor(): Promise<void> {
    this.colorText.set('');
    if (this.branding()?.primaryColor !== null) {
      await this.run(() => this.repository.updateColor(null), 'Se volvió al color por defecto.');
    }
  }

  /** Runs a change on the server, shows its result, and keeps the typed color as the saved one. */
  private async run(
    change: () => Observable<Branding> | Promise<Observable<Branding>>,
    message: string,
  ): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    try {
      this.adopt(await firstValueFrom(await change()));
      this.notice.set(message);
    } catch (error) {
      this.actionError.set(userMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  private adopt(branding: Branding): void {
    this.branding.set(branding);
    this.colorText.set(branding.primaryColor ?? '');
  }

  private releasePendingUrl(): void {
    const url = this.pendingUrl();
    if (url) {
      URL.revokeObjectURL(url);
    }
  }
}
