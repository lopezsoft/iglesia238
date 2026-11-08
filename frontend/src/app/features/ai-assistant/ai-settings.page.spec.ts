import { TestBed } from '@angular/core/testing';
import { Observable, of, throwError } from 'rxjs';
import { DomainError } from '../../core/errors/domain-error';
import { AiSettingsPage } from './ai-settings.page';
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

const MODELS = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'El más capaz' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'El más económico' },
];

const BASE: AiSettings = {
  congregationId: 10,
  congregationName: 'Sede Central',
  chatEnabled: false,
  mcpEnabled: false,
  provider: 'ANTHROPIC',
  model: 'claude-opus-5-5',
  models: MODELS,
  keyConfigured: false,
  keyLast4: null,
  mcpUrl: 'https://app.iglesia238.com/api/mcp',
  tokens: [],
};

const CONNECTION = {
  id: 1,
  name: 'Claude del pastor',
  tokenPrefix: 'i238_mcp_AbCd',
  createdByName: 'Marta Gómez',
  createdAt: '2026-11-08T15:00:00.000Z',
  lastUsedAt: null,
  expiresAt: null,
  revokedAt: null,
  active: true,
};

class FakeRepository extends AiAssistantRepository {
  state: AiSettings = BASE;
  failWith: DomainError | null = null;
  readonly keys: string[] = [];
  readonly changes: AiSettingsChanges[] = [];
  readonly created: NewAiConnection[] = [];
  readonly revoked: number[] = [];
  removedKey = 0;

  private respond(change: Partial<AiSettings>): Observable<AiSettings> {
    if (this.failWith) {
      return throwError(() => this.failWith);
    }
    this.state = { ...this.state, ...change };
    return of(this.state);
  }

  settings() {
    return of(this.state);
  }
  updateSettings(changes: AiSettingsChanges) {
    this.changes.push(changes);
    return this.respond(changes);
  }
  saveKey(apiKey: string) {
    this.keys.push(apiKey);
    return this.respond({ keyConfigured: true, keyLast4: apiKey.slice(-4) });
  }
  removeKey() {
    this.removedKey += 1;
    return this.respond({ keyConfigured: false, keyLast4: null, chatEnabled: false });
  }
  createConnection(connection: NewAiConnection): Observable<CreatedAiConnection> {
    this.created.push(connection);
    if (this.failWith) {
      return throwError(() => this.failWith);
    }
    this.state = { ...this.state, tokens: [{ ...CONNECTION, name: connection.name }] };
    return of({ ...CONNECTION, name: connection.name, token: 'i238_mcp_TOKEN-COMPLETO-QUE-SE-VE-UNA-VEZ' });
  }
  revokeConnection(id: number): Observable<void> {
    this.revoked.push(id);
    this.state = {
      ...this.state,
      tokens: this.state.tokens.map((token) =>
        token.id === id ? { ...token, revokedAt: '2026-11-08T16:00:00.000Z', active: false } : token,
      ),
    };
    return of(undefined);
  }
  chatStatus(): Observable<AiChatStatus> {
    throw new Error('not used');
  }
  ask(_messages: readonly AiChatMessage[]): Observable<AiChatReply> {
    throw new Error('not used');
  }
}

async function render(initial: Partial<AiSettings> = {}) {
  const repository = new FakeRepository();
  repository.state = { ...BASE, ...initial };
  TestBed.configureTestingModule({
    providers: [{ provide: AiAssistantRepository, useValue: repository }],
  });
  const fixture = TestBed.createComponent(AiSettingsPage);
  const element = fixture.nativeElement as HTMLElement;
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();

  const settle = async () => {
    await fixture.whenStable();
    fixture.detectChanges();
  };
  const button = (label: string) =>
    [...element.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim().startsWith(label));
  const type = async (selector: string, value: string) => {
    const input = element.querySelector<HTMLInputElement>(selector)!;
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await settle();
  };
  const toggle = async (selector: string) => {
    element.querySelector<HTMLInputElement>(selector)!.click();
    await settle();
  };
  return { fixture, element, repository, settle, button, type, toggle };
}

const KEY = 'sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789';

describe('AiSettingsPage', () => {
  it('says that the sede is the one deciding and what the assistant can see', async () => {
    const { element } = await render();

    expect(element.querySelector('h1')?.textContent).toContain('Asistente de IA');
    expect(element.textContent).toContain('Cada sede decide');
    expect(element.textContent).toContain('nunca nombres ni datos de personas');
    expect(element.textContent).toContain('Sede Central');
  });

  it('shows the error when the settings cannot be read', async () => {
    const repository = new FakeRepository();
    repository.settings = () => throwError(() => new DomainError('SERVER_ERROR', 'No pudimos leerlos.', 500));
    TestBed.configureTestingModule({ providers: [{ provide: AiAssistantRepository, useValue: repository }] });
    const fixture = TestBed.createComponent(AiSettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).querySelector('[role="alert"]')?.textContent).toContain('No pudimos leerlos.');
  });

  it('uses no native title attributes', async () => {
    const { element } = await render({ keyConfigured: true, keyLast4: '6789', tokens: [CONNECTION] });

    expect(element.querySelectorAll('[title]')).toHaveLength(0);
  });

  describe('the key', () => {
    it('asks to paste one when there is none', async () => {
      const { element } = await render();

      expect(element.textContent).toContain('Pegar la clave');
      expect(element.textContent).not.toContain('termina en');
    });

    it('never shows a saved key, only how it ends, and offers to replace it', async () => {
      const { element } = await render({ keyConfigured: true, keyLast4: '6789' });

      expect(element.textContent).toContain('termina en');
      expect(element.textContent).toContain('6789');
      expect(element.textContent).toContain('Reemplazar la clave');
    });

    it('hides what is typed', async () => {
      const { element } = await render();

      expect(element.querySelector<HTMLInputElement>('#ai-key')!.type).toBe('password');
    });

    it('keeps the save button off until something is typed', async () => {
      const { button, type } = await render();
      expect(button('Guardar clave')!.disabled).toBe(true);

      await type('#ai-key', KEY);

      expect(button('Guardar clave')!.disabled).toBe(false);
    });

    it('saves the key without the surrounding spaces, then empties the box and confirms', async () => {
      const { element, repository, button, type, settle } = await render();
      await type('#ai-key', `  ${KEY}  `);

      button('Guardar clave')!.click();
      await settle();

      expect(repository.keys).toEqual([KEY]);
      expect(element.querySelector<HTMLInputElement>('#ai-key')!.value).toBe('');
      expect(element.textContent).toContain('Guardamos la clave');
      expect(element.textContent).toContain(KEY.slice(-4));
      expect(element.textContent).not.toContain(KEY);
    });

    it('shows why the provider refused the key and keeps what was typed to fix it', async () => {
      const { element, repository, button, type, settle } = await render();
      repository.failWith = new DomainError('INVALID_AI_KEY', 'Anthropic no aceptó esa clave.', 400);
      await type('#ai-key', KEY);

      button('Guardar clave')!.click();
      await settle();

      expect(element.querySelector('[role="alert"]')?.textContent).toContain('Anthropic no aceptó esa clave.');
      expect(element.querySelector<HTMLInputElement>('#ai-key')!.value).toBe(KEY);
    });

    it('asks to confirm before removing the key', async () => {
      const { element, repository, button, settle } = await render({ keyConfigured: true, keyLast4: '6789', chatEnabled: true });

      button('Quitar la clave')!.click();
      await settle();
      expect(repository.removedKey).toBe(0);
      expect(element.textContent).toContain('¿Quitar la clave?');

      button('Sí, quitar')!.click();
      await settle();

      expect(repository.removedKey).toBe(1);
      expect(element.textContent).toContain('Pegar la clave');
    });

    it('lets the user back out of removing it', async () => {
      const { repository, button, settle } = await render({ keyConfigured: true, keyLast4: '6789' });
      button('Quitar la clave')!.click();
      await settle();

      button('Cancelar')!.click();
      await settle();

      expect(repository.removedKey).toBe(0);
      expect(button('Quitar la clave')).toBeDefined();
    });
  });

  describe('the chat', () => {
    it('cannot be turned on without a key, and says so', async () => {
      const { element } = await render();

      expect(element.querySelector<HTMLInputElement>('#ai-chat-enabled')!.disabled).toBe(true);
      expect(element.textContent).toContain('Primero guarda la clave de IA de la sede.');
    });

    it('turns on with a key', async () => {
      const { element, repository, toggle } = await render({ keyConfigured: true, keyLast4: '6789' });

      await toggle('#ai-chat-enabled');

      expect(repository.changes).toEqual([{ chatEnabled: true }]);
      expect(element.querySelector<HTMLInputElement>('#ai-chat-enabled')!.checked).toBe(true);
      expect(element.textContent).toContain('El chat quedó activado.');
    });

    it('turns off', async () => {
      const { repository, toggle, element } = await render({ keyConfigured: true, keyLast4: '6789', chatEnabled: true });

      await toggle('#ai-chat-enabled');

      expect(repository.changes).toEqual([{ chatEnabled: false }]);
      expect(element.textContent).toContain('El chat quedó apagado.');
    });

    it('puts the switch back when the API refuses the change, and says why', async () => {
      const { element, repository, toggle } = await render({ keyConfigured: true, keyLast4: '6789' });
      repository.failWith = new DomainError('AI_KEY_REQUIRED', 'Primero guarda la clave.', 422);

      await toggle('#ai-chat-enabled');

      expect(element.querySelector<HTMLInputElement>('#ai-chat-enabled')!.checked).toBe(false);
      expect(element.querySelector('[role="alert"]')?.textContent).toContain('Primero guarda la clave.');
    });

    it('lists the models with what each means and sends the one that is picked', async () => {
      const { element, repository, settle } = await render();
      const select = element.querySelector<HTMLSelectElement>('#ai-model')!;
      expect([...select.options].map((option) => option.textContent?.trim())).toEqual([
        'Claude Opus 5.5 · El más capaz',
        'Claude Haiku 5.5 · El más económico',
      ]);

      select.value = 'claude-haiku-5-5';
      select.dispatchEvent(new Event('change'));
      await settle();

      expect(repository.changes).toEqual([{ model: 'claude-haiku-5-5' }]);
    });
  });

  describe('connections from outside', () => {
    it('shows where to connect, and lets the user copy it', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      const { element, button, settle } = await render();

      expect(element.textContent).toContain('https://app.iglesia238.com/api/mcp');
      expect(element.textContent).toContain('Authorization: Bearer');
      button('Copiar')!.click();
      await settle();

      expect(writeText).toHaveBeenCalledWith('https://app.iglesia238.com/api/mcp');
      vi.unstubAllGlobals();
    });

    it('turns the connections on without needing a key', async () => {
      const { repository, toggle, element } = await render();

      await toggle('#ai-mcp-enabled');

      expect(repository.changes).toEqual([{ mcpEnabled: true }]);
      expect(element.textContent).toContain('Las conexiones externas quedaron activadas.');
    });

    it('says there are no connections yet', async () => {
      const { element } = await render();

      expect(element.textContent).toContain('Todavía no hay conexiones.');
    });

    it('keeps the create button off without a name', async () => {
      const { button, type } = await render();
      expect(button('Crear conexión')!.disabled).toBe(true);

      await type('#ai-connection-name', 'Claude');

      expect(button('Crear conexión')!.disabled).toBe(false);
    });

    it('creates a connection, shows its token with the warning, and lists it without the token', async () => {
      const { element, repository, button, type, settle } = await render();
      await type('#ai-connection-name', '  Claude del pastor  ');
      const expiry = element.querySelector<HTMLSelectElement>('#ai-connection-expiry')!;
      expiry.value = '30';
      expiry.dispatchEvent(new Event('change'));
      await settle();

      button('Crear conexión')!.click();
      await settle();

      expect(repository.created).toEqual([{ name: 'Claude del pastor', expiresInDays: 30 }]);
      expect(element.textContent).toContain('Copia el token de «Claude del pastor» ahora.');
      expect(element.textContent).toContain('No se vuelve a mostrar');
      expect(element.textContent).toContain('i238_mcp_TOKEN-COMPLETO-QUE-SE-VE-UNA-VEZ');
      expect(element.querySelector('table')?.textContent).toContain('Claude del pastor');
      expect(element.querySelector('table')?.textContent).not.toContain('TOKEN-COMPLETO');
      expect(element.querySelector<HTMLInputElement>('#ai-connection-name')!.value).toBe('');
    });

    it('sends no expiry when the connection does not expire', async () => {
      const { repository, button, type, settle } = await render();
      await type('#ai-connection-name', 'Claude');

      button('Crear conexión')!.click();
      await settle();

      expect(repository.created).toEqual([{ name: 'Claude' }]);
    });

    it('forgets the token once the user says they copied it', async () => {
      const { element, button, type, settle } = await render();
      await type('#ai-connection-name', 'Claude');
      button('Crear conexión')!.click();
      await settle();

      button('Ya lo copié')!.click();
      await settle();

      expect(element.textContent).not.toContain('TOKEN-COMPLETO');
      expect(element.textContent).not.toContain('Copia el token');
    });

    it('shows when it was used, when it expires and its state', async () => {
      const { element } = await render({
        tokens: [
          { ...CONNECTION, lastUsedAt: '2026-11-08T14:00:00.000Z', expiresAt: '2026-12-08T15:00:00.000Z' },
          { ...CONNECTION, id: 2, name: 'Vieja', revokedAt: '2026-10-01T10:00:00.000Z', active: false },
          { ...CONNECTION, id: 3, name: 'Vencida', active: false, expiresAt: '2026-10-01T10:00:00.000Z' },
        ],
      });

      const text = element.querySelector('table')!.textContent!;
      expect(text).toContain('08/12/2026');
      expect(text).toContain('Nunca');
      expect(text).toContain('Activa');
      expect(text).toContain('Revocada');
      expect(text).toContain('Vencida');
    });

    it('revokes a connection, with a label that says which one, and updates the list', async () => {
      const { element, repository, settle } = await render({ tokens: [CONNECTION] });
      const revoke = element.querySelector<HTMLButtonElement>('button[aria-label="Revocar la conexión Claude del pastor"]')!;

      revoke.click();
      await settle();

      expect(repository.revoked).toEqual([1]);
      expect(element.textContent).toContain('Revocamos la conexión «Claude del pastor».');
      expect(element.querySelector('table')?.textContent).toContain('Revocada');
      expect(element.querySelector('button[aria-label^="Revocar"]')).toBeNull();
    });

    it('shows why a connection could not be created', async () => {
      const { element, repository, button, type, settle } = await render();
      repository.failWith = new DomainError('AI_TOKEN_LIMIT', 'Una sede puede tener hasta 10 conexiones activas.', 422);
      await type('#ai-connection-name', 'Una más');

      button('Crear conexión')!.click();
      await settle();

      expect(element.querySelector('[role="alert"]')?.textContent).toContain('hasta 10 conexiones');
      expect(element.textContent).not.toContain('Copia el token');
    });
  });
});
