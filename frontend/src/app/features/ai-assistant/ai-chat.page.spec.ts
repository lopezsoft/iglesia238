import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { DomainError } from '../../core/errors/domain-error';
import { AiChatPage, messagesToSend } from './ai-chat.page';
import {
  AiChatMessage,
  AiChatReply,
  AiChatStatus,
  AiSettings,
  AiSettingsChanges,
  CreatedAiConnection,
  NewAiConnection,
} from './data/ai-assistant.models';
import { AiAssistantRepository } from './data/ai-assistant.repository';

const READY: AiChatStatus = {
  available: true,
  reason: null,
  model: 'claude-haiku-5-5',
  tools: [
    { name: 'resumen_financiero', title: 'Resumen financiero' },
    { name: 'estadisticas_asistencia', title: 'Asistencia a las reuniones' },
  ],
};

class FakeRepository extends AiAssistantRepository {
  status: AiChatStatus = READY;
  statusError: DomainError | null = null;
  readonly asked: Array<readonly AiChatMessage[]> = [];
  replies: Array<AiChatReply | DomainError> = [];

  chatStatus(): Observable<AiChatStatus> {
    return this.statusError ? throwError(() => this.statusError) : of(this.status);
  }
  ask(messages: readonly AiChatMessage[]): Observable<AiChatReply> {
    this.asked.push(messages);
    const next = this.replies.shift();
    if (!next) {
      return throwError(() => new Error('no reply scripted'));
    }
    return next instanceof DomainError ? throwError(() => next) : of(next);
  }
  settings(): Observable<AiSettings> {
    throw new Error('not used');
  }
  updateSettings(_changes: AiSettingsChanges): Observable<AiSettings> {
    throw new Error('not used');
  }
  saveKey(_apiKey: string): Observable<AiSettings> {
    throw new Error('not used');
  }
  removeKey(): Observable<AiSettings> {
    throw new Error('not used');
  }
  createConnection(_connection: NewAiConnection): Observable<CreatedAiConnection> {
    throw new Error('not used');
  }
  revokeConnection(_id: number): Observable<void> {
    throw new Error('not used');
  }
}

const reply = (text: string, consulted: AiChatReply['consulted'] = []): AiChatReply => ({
  reply: text,
  consulted,
  model: 'claude-haiku-5-5',
  usage: { inputTokens: 1, outputTokens: 1 },
});

async function render(options: { status?: Partial<AiChatStatus>; manage?: boolean; replies?: Array<AiChatReply | DomainError> } = {}) {
  const repository = new FakeRepository();
  repository.status = { ...READY, ...options.status };
  repository.replies = options.replies ?? [];
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: AiAssistantRepository, useValue: repository },
      { provide: AuthService, useValue: { can: (permission: string) => options.manage === true && permission === 'ai.manage', tenant: signal(null) } },
    ],
  });
  const fixture = TestBed.createComponent(AiChatPage);
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const box = () => element.querySelector<HTMLTextAreaElement>('#ai-question')!;
  const write = async (text: string) => {
    box().value = text;
    box().dispatchEvent(new Event('input'));
    await settle();
  };
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(label));
  return { fixture, element, repository, settle, box, write, button };
}

describe('AiChatPage', () => {
  it('shows the chat when the assistant is available, with the warning that it can be wrong', async () => {
    const { element, box } = await render();

    expect(box()).not.toBeNull();
    expect(element.textContent).toContain('puede equivocarse');
    expect(element.textContent).toContain('claude-haiku-5-5');
  });

  it('offers a question per consultation the person can make, and none for the rest', async () => {
    const { element } = await render();

    const texts = [...element.querySelectorAll('.chat__suggestions button')].map((b) => b.textContent?.trim());
    expect(texts).toHaveLength(2);
    expect(texts[0]).toContain('se recibió');
    expect(texts[1]).toContain('asistencia');
  });

  it('shows the error when the status cannot be read', async () => {
    const repository = new FakeRepository();
    repository.statusError = new DomainError('SERVER_ERROR', 'No pudimos cargarlo.', 500);
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: AiAssistantRepository, useValue: repository }, { provide: AuthService, useValue: { can: () => false } }],
    });
    const fixture = TestBed.createComponent(AiChatPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('No pudimos cargarlo.');
  });

  describe('when it is not available', () => {
    it.each([
      ['DISABLED', 'no está activado en tu sede'],
      ['NO_KEY', 'Falta la clave de IA'],
      ['NO_TOOLS', 'no tiene consultas disponibles'],
    ] as const)('explains %s', async (reason, text) => {
      const { element, box } = await render({ status: { available: false, reason } });

      expect(element.textContent).toContain(text);
      expect(box()).toBeNull();
    });

    it('tells whoever cannot configure it to ask the pastor, and offers no link', async () => {
      const { element } = await render({ status: { available: false, reason: 'DISABLED' } });

      expect(element.textContent).toContain('Pídele al pastor');
      expect(element.querySelector('a[href="/ai-settings"]')).toBeNull();
    });

    it('takes whoever can configure it to the settings', async () => {
      const { element } = await render({ status: { available: false, reason: 'NO_KEY' }, manage: true });

      expect(element.textContent).not.toContain('Pídele al pastor');
      expect(element.querySelector('a[href="/ai-settings"]')).not.toBeNull();
    });
  });

  describe('asking', () => {
    it('sends the question, shows the answer and says what was looked up', async () => {
      const { element, repository, write, button, settle } = await render({
        replies: [reply('Entraron $1.250.000.', [{ name: 'resumen_financiero', title: 'Resumen financiero' }])],
      });
      await write('¿Cuánto entró este año?');

      button('Enviar')!.click();
      await settle();

      expect(repository.asked).toEqual([[{ role: 'user', content: '¿Cuánto entró este año?' }]]);
      const text = element.querySelector('.chat__log')!.textContent!;
      expect(text).toContain('¿Cuánto entró este año?');
      expect(text).toContain('Entraron $1.250.000.');
      expect(text).toContain('Consultó: Resumen financiero');
    });

    it('empties the box and keeps the send button off while there is nothing to send', async () => {
      const { box, write, button, settle } = await render({ replies: [reply('Listo.')] });
      expect(button('Enviar')!.disabled).toBe(true);
      await write('Hola');
      expect(button('Enviar')!.disabled).toBe(false);

      button('Enviar')!.click();
      await settle();

      expect(box().value).toBe('');
      expect(button('Enviar')!.disabled).toBe(true);
    });

    it('sends with Enter, and Shift + Enter leaves a line break instead', async () => {
      const { box, write, repository, settle } = await render({ replies: [reply('Listo.')] });
      await write('Hola');

      box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true }));
      await settle();
      expect(repository.asked).toHaveLength(0);

      box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect(repository.asked).toHaveLength(1);
    });

    it('does not send a blank question', async () => {
      const { box, write, repository, settle } = await render();
      await write('   ');

      box().dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();

      expect(repository.asked).toHaveLength(0);
    });

    it('asks a suggested question with one click', async () => {
      const { element, repository, settle } = await render({ replies: [reply('Un millón.')] });

      element.querySelector<HTMLButtonElement>('.chat__suggestions button')!.click();
      await settle();

      expect(repository.asked[0][0].content).toContain('se recibió');
      expect(element.querySelector('.chat__suggestions')).toBeNull();
    });

    it('keeps the whole conversation to send with each question', async () => {
      const { repository, write, button, settle } = await render({ replies: [reply('Un millón.'), reply('Seiscientos mil.')] });
      await write('¿Cuánto entró?');
      button('Enviar')!.click();
      await settle();
      await write('¿Y cuánto salió?');

      button('Enviar')!.click();
      await settle();

      expect(repository.asked[1]).toEqual([
        { role: 'user', content: '¿Cuánto entró?' },
        { role: 'assistant', content: 'Un millón.' },
        { role: 'user', content: '¿Y cuánto salió?' },
      ]);
    });

    it('puts the question back in the box, and shows why, when the assistant could not answer', async () => {
      const { element, box, write, button, settle } = await render({
        replies: [new DomainError('AI_KEY_REJECTED', 'Anthropic rechazó la clave de la sede.', 422)],
      });
      await write('¿Cuánto entró?');

      button('Enviar')!.click();
      await settle();

      expect(element.querySelector('[role="alert"]')?.textContent).toContain('Anthropic rechazó la clave');
      expect(box().value).toBe('¿Cuánto entró?');
      expect(element.querySelector('.chat__log')!.textContent).not.toContain('¿Cuánto entró?');
    });

    it('starts a new conversation', async () => {
      const { element, repository, write, button, settle } = await render({ replies: [reply('Un millón.'), reply('Listo.')] });
      await write('¿Cuánto entró?');
      button('Enviar')!.click();
      await settle();

      button('Nueva conversación')!.click();
      await settle();
      await write('Otra cosa');
      button('Enviar')!.click();
      await settle();

      expect(repository.asked[1]).toEqual([{ role: 'user', content: 'Otra cosa' }]);
      expect(element.querySelector('.chat__log')!.textContent).not.toContain('Un millón.');
    });

    it('shows the text as text, never as markup', async () => {
      const { element, write, button, settle } = await render({ replies: [reply('<img src=x onerror=alert(1)> <b>negrita</b>')] });
      await write('Hola');

      button('Enviar')!.click();
      await settle();

      expect(element.querySelector('.chat__log img')).toBeNull();
      expect(element.querySelector('.chat__log b')).toBeNull();
      expect(element.querySelector('.chat__log')!.textContent).toContain('<b>negrita</b>');
    });
  });

  it('uses no native title attributes', async () => {
    const { element } = await render();

    expect(element.querySelectorAll('[title]')).toHaveLength(0);
  });
});

describe('messagesToSend', () => {
  const entry = (role: 'user' | 'assistant', content: string) => ({ role, content, consulted: [] });

  it('drops what the API does not need: the consultations', () => {
    expect(
      messagesToSend([
        entry('user', 'a'),
        { role: 'assistant', content: 'b', consulted: [{ name: 'x', title: 'X' }] },
        entry('user', 'c'),
      ]),
    ).toEqual([
      { role: 'user', content: 'a' },
      { role: 'assistant', content: 'b' },
      { role: 'user', content: 'c' },
    ]);
  });

  it('keeps the last 20 messages and starts with one of the person, as the provider requires', () => {
    const entries = Array.from({ length: 31 }, (_, index) => entry(index % 2 === 0 ? 'user' : 'assistant', String(index)));

    const sent = messagesToSend(entries);

    expect(sent.length).toBeLessThanOrEqual(20);
    expect(sent[0].role).toBe('user');
    expect(sent.at(-1)).toEqual({ role: 'user', content: '30' });
  });

  it('sends a short conversation whole', () => {
    expect(messagesToSend([entry('user', 'a')])).toEqual([{ role: 'user', content: 'a' }]);
  });
});
