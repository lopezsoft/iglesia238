import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { AiAssistantRepository } from './ai-assistant.repository';
import { HttpAiAssistantRepository } from './http-ai-assistant.repository';

function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: AiAssistantRepository, useClass: HttpAiAssistantRepository },
    ],
  });
  return {
    repository: TestBed.inject(AiAssistantRepository),
    backend: TestBed.inject(HttpTestingController),
  };
}

describe('HttpAiAssistantRepository', () => {
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('reads the settings of the sede', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.settings());
    const request = backend.expectOne('/api/ai/settings');
    expect(request.request.method).toBe('GET');
    request.flush({ congregationName: 'Sede Central', tokens: [] });

    expect((await result).congregationName).toBe('Sede Central');
  });

  it('sends only the changes of the settings', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.updateSettings({ mcpEnabled: true }));
    const request = backend.expectOne('/api/ai/settings');
    expect(request.request.method).toBe('PATCH');
    expect(request.request.body).toEqual({ mcpEnabled: true });
    request.flush({ mcpEnabled: true });

    expect((await result).mcpEnabled).toBe(true);
  });

  it('sends the key once, in the body, and never puts it in the address', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.saveKey('sk-ant-api03-secreta'));
    const request = backend.expectOne('/api/ai/settings/key');
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ apiKey: 'sk-ant-api03-secreta' });
    expect(request.request.urlWithParams).not.toContain('secreta');
    request.flush({ keyConfigured: true, keyLast4: 'reta' });

    expect((await result).keyConfigured).toBe(true);
  });

  it('removes the key', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.removeKey());
    const request = backend.expectOne('/api/ai/settings/key');
    expect(request.request.method).toBe('DELETE');
    request.flush({ keyConfigured: false });

    expect((await result).keyConfigured).toBe(false);
  });

  it('creates a connection and revokes it by its id', async () => {
    const { repository, backend } = setup();

    const created = firstValueFrom(repository.createConnection({ name: 'Claude', expiresInDays: 30 }));
    const create = backend.expectOne('/api/ai/tokens');
    expect(create.request.method).toBe('POST');
    expect(create.request.body).toEqual({ name: 'Claude', expiresInDays: 30 });
    create.flush({ id: 4, name: 'Claude', token: 'i238_mcp_x' });
    expect((await created).token).toBe('i238_mcp_x');

    const revoked = firstValueFrom(repository.revokeConnection(4), { defaultValue: undefined });
    const revoke = backend.expectOne('/api/ai/tokens/4');
    expect(revoke.request.method).toBe('DELETE');
    revoke.flush(null, { status: 204, statusText: 'No Content' });
    await revoked;
  });

  it('asks the status of the chat', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.chatStatus());
    backend.expectOne('/api/ai/chat/status').flush({ available: true, reason: null, model: 'm', tools: [] });

    expect((await result).available).toBe(true);
  });

  it('sends the whole conversation to the chat', async () => {
    const { repository, backend } = setup();

    const result = firstValueFrom(repository.ask([{ role: 'user', content: '¿Cuánto entró?' }]));
    const request = backend.expectOne('/api/ai/chat');
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ messages: [{ role: 'user', content: '¿Cuánto entró?' }] });
    request.flush({ reply: 'Un millón.', consulted: [], model: 'm', usage: { inputTokens: 1, outputTokens: 1 } });

    expect((await result).reply).toBe('Un millón.');
  });
});
