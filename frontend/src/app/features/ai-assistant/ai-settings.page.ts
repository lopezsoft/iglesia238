import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { userMessage } from '../../core/errors/domain-error';
import { AiSettings, CreatedAiConnection } from './data/ai-assistant.models';
import { AiAssistantRepository } from './data/ai-assistant.repository';

const EXPIRY_OPTIONS: ReadonlyArray<{ readonly days: number | null; readonly label: string }> = [
  { days: null, label: 'No vence' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
  { days: 365, label: '1 año' },
];

/**
 * Each sede decides whether to use AI: it pastes its own provider key (the bill is its own), turns on the chat of the
 * app and/or the connections of external AI tools, and sees who is connected. Nothing here is shared between sedes.
 */
@Component({
  selector: 'app-ai-settings-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  styles: `
    @use 'tokens' as *;

    .ai {
      display: grid;
      gap: $space-5;
      grid-template-columns: minmax(0, 1fr);
      max-width: 52rem;
    }

    .ai__row {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
      align-items: center;
    }

    .ai__switch {
      display: flex;
      align-items: flex-start;
      gap: $space-3;
    }

    .ai__switch input {
      margin-top: $space-1;
      inline-size: 1.1rem;
      block-size: 1.1rem;
    }

    .ai__hint {
      display: block;
    }

    .ai__url {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
      align-items: center;
    }

    .ai__url code,
    .ai__token code {
      overflow-wrap: anywhere;
      padding: $space-2 $space-3;
      border: 1px solid $color-border;
      border-radius: $radius-control;
      background: $color-surface;
    }

    .ai__token {
      display: grid;
      gap: $space-3;
    }
  `,
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Asistente de IA</h1>
        <p class="text-muted">
          Cada sede decide si usa inteligencia artificial. El asistente solo ve cifras sumadas (finanzas, diezmos,
          asistencia y cantidad de miembros): nunca nombres ni datos de personas, y no puede modificar nada.
        </p>
      </header>

      @if (loading()) {
        <p class="text-muted" aria-live="polite">Cargando…</p>
      } @else if (loadError(); as message) {
        <p class="alert alert--danger" role="alert">{{ message }}</p>
      } @else if (settings(); as current) {
        <div class="ai">
          <div aria-live="polite">
            @if (notice(); as message) {
              <p class="alert alert--success" role="status">{{ message }}</p>
            }
          </div>
          @if (actionError(); as message) {
            <p class="alert alert--danger" role="alert">{{ message }}</p>
          }

          <section class="card stack" aria-labelledby="ai-key-title">
            <h2 id="ai-key-title">Clave de IA de {{ current.congregationName }}</h2>
            <p class="text-muted">
              La clave es de tu sede: el uso del chat se cobra a su cuenta de Anthropic. Se guarda cifrada y no se
              puede volver a ver, solo reemplazar o quitar. La consigues en
              <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener noreferrer"
                >console.anthropic.com</a
              >.
            </p>
            @if (current.keyConfigured) {
              <p class="alert alert--success" role="note">
                Hay una clave guardada que termina en <strong class="mono">{{ current.keyLast4 }}</strong>.
              </p>
            }
            <div class="field">
              <label for="ai-key">{{ current.keyConfigured ? 'Reemplazar la clave' : 'Pegar la clave' }}</label>
              <input
                id="ai-key"
                class="input mono"
                type="password"
                autocomplete="off"
                spellcheck="false"
                placeholder="sk-ant-…"
                [value]="keyText()"
                [disabled]="busy()"
                (input)="keyText.set($any($event.target).value)"
              />
              <span class="field__hint">Se comprueba con Anthropic antes de guardarla.</span>
            </div>
            <div class="ai__row">
              <button type="button" class="btn btn--primary" [disabled]="busy() || keyText().trim() === ''" (click)="saveKey()">
                Guardar clave
              </button>
              @if (current.keyConfigured) {
                @if (confirmRemoval()) {
                  <span class="text-muted">¿Quitar la clave? El chat se apagará.</span>
                  <button type="button" class="btn btn--danger" [disabled]="busy()" (click)="removeKey()">Sí, quitar</button>
                  <button type="button" class="btn btn--secondary" [disabled]="busy()" (click)="confirmRemoval.set(false)">
                    Cancelar
                  </button>
                } @else {
                  <button type="button" class="btn btn--secondary" [disabled]="busy()" (click)="confirmRemoval.set(true)">
                    Quitar la clave
                  </button>
                }
              }
            </div>
          </section>

          <section class="card stack" aria-labelledby="ai-chat-title">
            <h2 id="ai-chat-title">Chat dentro de la aplicación</h2>
            <label class="ai__switch" for="ai-chat-enabled">
              <input
                id="ai-chat-enabled"
                type="checkbox"
                [checked]="current.chatEnabled"
                [disabled]="busy() || (!current.keyConfigured && !current.chatEnabled)"
                (change)="setChat($event)"
              />
              <span>
                <strong>Activar el chat para esta sede</strong>
                <span class="field__hint ai__hint">
                  {{
                    current.keyConfigured
                      ? 'Lo podrán usar los pastores, la secretaría y la tesorería, con lo que cada rol puede consultar.'
                      : 'Primero guarda la clave de IA de la sede.'
                  }}
                </span>
              </span>
            </label>
            <div class="field">
              <label for="ai-model">Modelo</label>
              <select id="ai-model" class="select" aria-describedby="ai-model-help" [disabled]="busy()" (change)="setModel($event)">
                @for (model of current.models; track model.id) {
                  <option [value]="model.id" [selected]="model.id === current.model">{{ model.label }} · {{ model.hint }}</option>
                }
              </select>
              <span id="ai-model-help" class="field__hint">
                Un modelo más capaz responde mejor las preguntas complejas y cuesta más por consulta.
              </span>
            </div>
          </section>

          <section class="card stack" aria-labelledby="ai-mcp-title">
            <h2 id="ai-mcp-title">Conexiones de herramientas externas (MCP)</h2>
            <p class="text-muted">
              Para usar tu propia IA (por ejemplo Claude) con los datos de esta sede, sin pasar por el chat de la aplicación:
              la herramienta se conecta con un token y paga con su propia cuenta. No necesita la clave de arriba.
            </p>
            <label class="ai__switch" for="ai-mcp-enabled">
              <input
                id="ai-mcp-enabled"
                type="checkbox"
                [checked]="current.mcpEnabled"
                [disabled]="busy()"
                (change)="setMcp($event)"
              />
              <span>
                <strong>Aceptar conexiones externas</strong>
                <span class="field__hint ai__hint">
                  Apagarlo corta de inmediato todas las conexiones, sin borrar sus tokens.
                </span>
              </span>
            </label>

            <div class="field">
              <span id="ai-url-label" class="field__label">Dirección del servidor</span>
              <div class="ai__url">
                <code aria-labelledby="ai-url-label">{{ current.mcpUrl }}</code>
                <button type="button" class="btn btn--secondary btn--sm" (click)="copy(current.mcpUrl)">Copiar</button>
              </div>
              <span class="field__hint">
                En tu herramienta de IA agrega un servidor MCP remoto con esa dirección y envía el token en la cabecera
                <code>Authorization: Bearer &lt;token&gt;</code>.
              </span>
            </div>

            @if (created(); as connection) {
              <div class="alert alert--warning ai__token" role="alert">
                <p>
                  <strong>Copia el token de «{{ connection.name }}» ahora.</strong> No se vuelve a mostrar: si lo pierdes,
                  crea otra conexión y revoca esta.
                </p>
                <code>{{ connection.token }}</code>
                <div class="ai__row">
                  <button type="button" class="btn btn--primary btn--sm" (click)="copy(connection.token)">
                    {{ copied() ? 'Copiado' : 'Copiar el token' }}
                  </button>
                  <button type="button" class="btn btn--secondary btn--sm" (click)="dismissCreated()">Ya lo copié</button>
                </div>
              </div>
            }

            <h3>Conexiones</h3>
            @if (current.tokens.length === 0) {
              <p class="text-muted">Todavía no hay conexiones.</p>
            } @else {
              <div class="table-wrap">
                <table class="table">
                  <caption class="visually-hidden">Conexiones de herramientas externas de IA</caption>
                  <thead>
                    <tr>
                      <th scope="col">Nombre</th>
                      <th scope="col">Token</th>
                      <th scope="col">Creada</th>
                      <th scope="col">Último uso</th>
                      <th scope="col">Vence</th>
                      <th scope="col">Estado</th>
                      <th scope="col"><span class="visually-hidden">Acciones</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (token of current.tokens; track token.id) {
                      <tr>
                        <td>
                          {{ token.name }}
                          @if (token.createdByName) {
                            <div class="text-muted text-small">por {{ token.createdByName }}</div>
                          }
                        </td>
                        <td class="mono">{{ token.tokenPrefix }}…</td>
                        <td>{{ token.createdAt | date: 'dd/MM/yyyy' }}</td>
                        <td>{{ token.lastUsedAt ? (token.lastUsedAt | date: 'dd/MM/yyyy HH:mm') : 'Nunca' }}</td>
                        <td>{{ token.expiresAt ? (token.expiresAt | date: 'dd/MM/yyyy') : 'No vence' }}</td>
                        <td>{{ token.revokedAt ? 'Revocada' : token.active ? 'Activa' : 'Vencida' }}</td>
                        <td>
                          @if (token.revokedAt === null) {
                            <button
                              type="button"
                              class="btn btn--secondary btn--sm"
                              [attr.aria-label]="'Revocar la conexión ' + token.name"
                              [disabled]="busy()"
                              (click)="revoke(token.id, token.name)"
                            >
                              Revocar
                            </button>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }

            <h3>Nueva conexión</h3>
            <div class="ai__row">
              <div class="field">
                <label for="ai-connection-name">Nombre</label>
                <input
                  id="ai-connection-name"
                  class="input"
                  type="text"
                  maxlength="80"
                  autocomplete="off"
                  placeholder="Claude del pastor"
                  [value]="connectionName()"
                  [disabled]="busy()"
                  (input)="connectionName.set($any($event.target).value)"
                />
              </div>
              <div class="field">
                <label for="ai-connection-expiry">Vigencia</label>
                <select id="ai-connection-expiry" class="select" [disabled]="busy()" (change)="setExpiry($event)">
                  @for (option of expiryOptions; track option.label) {
                    <option [value]="option.days ?? ''" [selected]="option.days === connectionDays()">{{ option.label }}</option>
                  }
                </select>
              </div>
              <button
                type="button"
                class="btn btn--primary"
                [disabled]="busy() || connectionName().trim() === ''"
                (click)="createConnection()"
              >
                Crear conexión
              </button>
            </div>
          </section>
        </div>
      }
    </div>
  `,
})
export class AiSettingsPage implements OnInit {
  private readonly repository = inject(AiAssistantRepository);

  protected readonly expiryOptions = EXPIRY_OPTIONS;
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly settings = signal<AiSettings | null>(null);
  protected readonly busy = signal(false);
  protected readonly notice = signal<string | null>(null);
  protected readonly actionError = signal<string | null>(null);

  protected readonly keyText = signal('');
  protected readonly confirmRemoval = signal(false);
  protected readonly connectionName = signal('');
  protected readonly connectionDays = signal<number | null>(null);
  /** The connection just created, with the only copy of its token. */
  protected readonly created = signal<CreatedAiConnection | null>(null);
  protected readonly copied = signal(false);

  protected readonly hasKey = computed(() => this.settings()?.keyConfigured === true);

  async ngOnInit(): Promise<void> {
    try {
      this.settings.set(await firstValueFrom(this.repository.settings()));
    } catch (error) {
      this.loadError.set(userMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected saveKey(): Promise<void> {
    const key = this.keyText().trim();
    if (key === '') {
      return Promise.resolve();
    }
    return this.run(
      () => this.repository.saveKey(key),
      'Guardamos la clave de la sede.',
      () => this.keyText.set(''),
    );
  }

  protected removeKey(): Promise<void> {
    this.confirmRemoval.set(false);
    return this.run(() => this.repository.removeKey(), 'Quitamos la clave de la sede y apagamos el chat.');
  }

  protected setChat(event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const enabled = box.checked;
    return this.run(
      () => this.repository.updateSettings({ chatEnabled: enabled }),
      enabled ? 'El chat quedó activado.' : 'El chat quedó apagado.',
      undefined,
      // The box already flipped: when the API refuses, it goes back to what is saved.
      () => (box.checked = !enabled),
    );
  }

  protected setMcp(event: Event): Promise<void> {
    const box = event.target as HTMLInputElement;
    const enabled = box.checked;
    return this.run(
      () => this.repository.updateSettings({ mcpEnabled: enabled }),
      enabled ? 'Las conexiones externas quedaron activadas.' : 'Las conexiones externas quedaron apagadas.',
      undefined,
      () => (box.checked = !enabled),
    );
  }

  protected setModel(event: Event): Promise<void> {
    const model = (event.target as HTMLSelectElement).value;
    return this.run(() => this.repository.updateSettings({ model }), 'Cambiamos el modelo del chat.');
  }

  protected setExpiry(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.connectionDays.set(value === '' ? null : Number(value));
  }

  protected async createConnection(): Promise<void> {
    const name = this.connectionName().trim();
    if (name === '' || this.busy()) {
      return;
    }
    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    try {
      const days = this.connectionDays();
      const connection = await firstValueFrom(
        this.repository.createConnection({ name, ...(days === null ? {} : { expiresInDays: days }) }),
      );
      this.created.set(connection);
      this.copied.set(false);
      this.connectionName.set('');
      this.settings.set(await firstValueFrom(this.repository.settings()));
    } catch (error) {
      this.actionError.set(userMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected revoke(id: number, name: string): Promise<void> {
    return this.run(
      async () => {
        await firstValueFrom(this.repository.revokeConnection(id));
        return firstValueFrom(this.repository.settings());
      },
      `Revocamos la conexión «${name}».`,
    );
  }

  protected dismissCreated(): void {
    this.created.set(null);
  }

  protected async copy(text: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
    } catch {
      this.actionError.set('No pudimos copiar al portapapeles: selecciona el texto y cópialo a mano.');
    }
  }

  /** Runs a change, shows its message, and keeps the settings that come back. One at a time. */
  private async run(
    action: () => Observable<AiSettings> | Promise<AiSettings>,
    message: string,
    done?: () => void,
    failed?: () => void,
  ): Promise<void> {
    if (this.busy()) {
      return;
    }
    this.busy.set(true);
    this.notice.set(null);
    this.actionError.set(null);
    try {
      const result = action();
      this.settings.set(await (result instanceof Promise ? result : firstValueFrom(result)));
      this.notice.set(message);
      done?.();
    } catch (error) {
      this.actionError.set(userMessage(error));
      failed?.();
    } finally {
      this.busy.set(false);
    }
  }
}
