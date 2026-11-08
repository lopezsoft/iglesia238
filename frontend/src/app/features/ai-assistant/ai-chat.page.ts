import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { userMessage } from '../../core/errors/domain-error';
import { AiChatMessage, AiChatStatus, AiConsultation } from './data/ai-assistant.models';
import { AiAssistantRepository } from './data/ai-assistant.repository';

/** The API keeps this many messages of a conversation; older ones are left out of what is sent. */
const MAX_MESSAGES_SENT = 20;
/** Longest message of a person the API accepts. */
export const CHAT_MAX_CHARS = 4000;

/** A question to start with, per consultation the person can make. */
const SUGGESTIONS: Readonly<Record<string, string>> = {
  resumen_financiero: '¿Cuánto se recibió y cuánto se gastó en lo que va del año?',
  resumen_diezmos: '¿Cuánto llevamos de diezmos este año y cuál fue la última liquidación?',
  estadisticas_asistencia: '¿Cómo va la asistencia este año comparada con la del año pasado?',
  miembros_por_estado: '¿Cuántos miembros activos tiene la sede y cómo se reparten por edad?',
};

interface ChatEntry {
  readonly role: 'user' | 'assistant';
  readonly content: string;
  /** What the assistant looked up to answer (only for its answers). */
  readonly consulted: readonly AiConsultation[];
}

/** The messages that go to the API: the last ones, starting with one of the person, as the provider requires. */
export function messagesToSend(entries: readonly ChatEntry[]): AiChatMessage[] {
  const recent = entries.slice(-MAX_MESSAGES_SENT);
  const firstUser = recent.findIndex((entry) => entry.role === 'user');
  return recent.slice(Math.max(firstUser, 0)).map(({ role, content }) => ({ role, content }));
}

/**
 * Chat with the assistant of the sede. It answers only from figures it looks up (finance, tithes, attendance, member
 * counts) with what the person is allowed to see, and says what it looked up.
 */
@Component({
  selector: 'app-ai-chat-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  styles: `
    @use 'tokens' as *;

    .chat {
      display: grid;
      gap: $space-4;
      max-width: 50rem;
    }

    .chat__log {
      display: grid;
      gap: $space-3;
      align-content: start;
      min-block-size: 16rem;
      max-block-size: 60vh;
      overflow-y: auto;
      padding: $space-4;
      border: 1px solid $color-border;
      border-radius: $radius-control;
      background: $color-surface;
    }

    .chat__message {
      display: grid;
      gap: $space-1;
      max-inline-size: 90%;
    }

    .chat__message--user {
      justify-self: end;
    }

    .chat__bubble {
      margin: 0;
      padding: $space-3 $space-4;
      border-radius: $radius-control;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border: 1px solid $color-border;
    }

    .chat__message--user .chat__bubble {
      background: $color-border;
    }

    .chat__consulted {
      margin: 0;
    }

    .chat__suggestions,
    .chat__actions {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
      align-items: center;
    }

    .chat__form {
      display: grid;
      gap: $space-2;
    }
  `,
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Asistente de IA</h1>
        <p class="text-muted">
          Pregunta por las cifras de tu sede: finanzas, diezmos, asistencia y número de miembros. Responde solo con
          lo que tu rol puede consultar y nunca entrega datos de personas.
        </p>
      </header>

      @if (loading()) {
        <p class="text-muted" aria-live="polite">Cargando…</p>
      } @else if (loadError(); as message) {
        <p class="alert alert--danger" role="alert">{{ message }}</p>
      } @else if (status(); as current) {
        @if (!current.available) {
          <div class="alert alert--warning" role="status">
            <p>{{ unavailableText() }}</p>
            @if (canConfigure()) {
              <p><a routerLink="/ai-settings">Ir a la configuración del asistente</a></p>
            }
          </div>
        } @else {
          <div class="chat">
            <div
              #log
              class="chat__log"
              role="log"
              aria-live="polite"
              aria-label="Conversación con el asistente"
              tabindex="0"
            >
              @if (entries().length === 0) {
                <p class="text-muted">
                  Empieza con tu pregunta o elige una de estas:
                </p>
                <div class="chat__suggestions">
                  @for (suggestion of suggestions(); track suggestion) {
                    <button type="button" class="btn btn--secondary btn--sm" [disabled]="sending()" (click)="send(suggestion)">
                      {{ suggestion }}
                    </button>
                  }
                </div>
              }
              @for (entry of entries(); track $index) {
                <div class="chat__message" [class.chat__message--user]="entry.role === 'user'">
                  <p class="text-muted text-small">{{ entry.role === 'user' ? 'Tú' : 'Asistente' }}</p>
                  <p class="chat__bubble">{{ entry.content }}</p>
                  @if (entry.consulted.length > 0) {
                    <p class="chat__consulted text-muted text-small">Consultó: {{ consultedText(entry) }}</p>
                  }
                </div>
              }
              @if (sending()) {
                <p class="text-muted" role="status">Consultando…</p>
              }
            </div>

            @if (error(); as message) {
              <p class="alert alert--danger" role="alert">{{ message }}</p>
            }

            <form class="chat__form" (submit)="$event.preventDefault(); send()">
              <label class="visually-hidden" for="ai-question">Tu pregunta</label>
              <textarea
                id="ai-question"
                class="input"
                rows="3"
                [attr.maxlength]="maxChars"
                placeholder="Escribe tu pregunta. Enter envía; Shift + Enter hace un salto de línea."
                [value]="draft()"
                [disabled]="sending()"
                (input)="draft.set($any($event.target).value)"
                (keydown.enter)="onEnter($event)"
              ></textarea>
              <div class="chat__actions">
                <button type="submit" class="btn btn--primary" [disabled]="sending() || draft().trim() === ''">Enviar</button>
                <button
                  type="button"
                  class="btn btn--secondary"
                  [disabled]="sending() || entries().length === 0"
                  (click)="reset()"
                >
                  Nueva conversación
                </button>
              </div>
            </form>

            <p class="text-muted text-small">
              El asistente puede equivocarse: confirma las cifras importantes en las pantallas de la aplicación.
              Responde con el modelo {{ current.model }}.
            </p>
          </div>
        }
      }
    </div>
  `,
})
export class AiChatPage implements OnInit {
  private readonly repository = inject(AiAssistantRepository);
  private readonly auth = inject(AuthService);
  private readonly log = viewChild<ElementRef<HTMLElement>>('log');

  protected readonly maxChars = CHAT_MAX_CHARS;
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly status = signal<AiChatStatus | null>(null);
  protected readonly entries = signal<readonly ChatEntry[]>([]);
  protected readonly draft = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canConfigure = computed(() => this.auth.can('ai.manage'));
  protected readonly suggestions = computed(() =>
    (this.status()?.tools ?? []).flatMap((tool) => (SUGGESTIONS[tool.name] ? [SUGGESTIONS[tool.name]] : [])),
  );
  protected readonly unavailableText = computed(() => {
    switch (this.status()?.reason) {
      case 'DISABLED':
        return this.canConfigure()
          ? 'El asistente no está activado en tu sede.'
          : 'El asistente no está activado en tu sede. Pídele al pastor que lo active.';
      case 'NO_KEY':
        return this.canConfigure()
          ? 'Falta la clave de IA de la sede.'
          : 'Falta la clave de IA de la sede. Pídele al pastor que la guarde.';
      case 'NO_TOOLS':
        return 'Tu rol todavía no tiene consultas disponibles para el asistente.';
      default:
        return '';
    }
  });

  constructor() {
    // The newest message stays in view.
    effect(() => {
      this.entries();
      this.sending();
      const element = this.log()?.nativeElement;
      if (element) {
        queueMicrotask(() => (element.scrollTop = element.scrollHeight));
      }
    });
  }

  async ngOnInit(): Promise<void> {
    try {
      this.status.set(await firstValueFrom(this.repository.chatStatus()));
    } catch (error) {
      this.loadError.set(userMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected consultedText(entry: ChatEntry): string {
    return [...new Set(entry.consulted.map((consultation) => consultation.title))].join(' · ');
  }

  protected onEnter(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) {
      return;
    }
    event.preventDefault();
    void this.send();
  }

  protected async send(text?: string): Promise<void> {
    const content = (text ?? this.draft()).trim();
    if (content === '' || this.sending() || this.status()?.available !== true) {
      return;
    }
    const before = this.entries();
    const next: readonly ChatEntry[] = [...before, { role: 'user', content, consulted: [] }];
    this.entries.set(next);
    this.draft.set('');
    this.error.set(null);
    this.sending.set(true);
    try {
      const reply = await firstValueFrom(this.repository.ask(messagesToSend(next)));
      this.entries.update((entries) => [
        ...entries,
        { role: 'assistant', content: reply.reply, consulted: reply.consulted },
      ]);
    } catch (error) {
      // Nothing was answered: the question goes back to the box to be sent again.
      this.entries.set(before);
      this.draft.set(content);
      this.error.set(userMessage(error));
    } finally {
      this.sending.set(false);
    }
  }

  protected reset(): void {
    this.entries.set([]);
    this.error.set(null);
  }
}
