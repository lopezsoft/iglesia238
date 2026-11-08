import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../../../core/http/api-url';
import {
  AiChatMessage,
  AiChatReply,
  AiChatStatus,
  AiSettings,
  AiSettingsChanges,
  CreatedAiConnection,
  NewAiConnection,
} from './ai-assistant.models';
import { AiAssistantRepository } from './ai-assistant.repository';

/** `/api/ai`: the settings need `ai.manage` and the chat `ai.use`, in the scope of one sede. */
@Injectable()
export class HttpAiAssistantRepository extends AiAssistantRepository {
  private readonly http = inject(HttpClient);

  override settings(): Observable<AiSettings> {
    return this.http.get<AiSettings>(apiUrl('/ai/settings'));
  }

  override updateSettings(changes: AiSettingsChanges): Observable<AiSettings> {
    return this.http.patch<AiSettings>(apiUrl('/ai/settings'), changes);
  }

  override saveKey(apiKey: string): Observable<AiSettings> {
    return this.http.put<AiSettings>(apiUrl('/ai/settings/key'), { apiKey });
  }

  override removeKey(): Observable<AiSettings> {
    return this.http.delete<AiSettings>(apiUrl('/ai/settings/key'));
  }

  override createConnection(connection: NewAiConnection): Observable<CreatedAiConnection> {
    return this.http.post<CreatedAiConnection>(apiUrl('/ai/tokens'), connection);
  }

  override revokeConnection(id: number): Observable<void> {
    return this.http.delete<void>(apiUrl(`/ai/tokens/${id}`));
  }

  override chatStatus(): Observable<AiChatStatus> {
    return this.http.get<AiChatStatus>(apiUrl('/ai/chat/status'));
  }

  override ask(messages: readonly AiChatMessage[]): Observable<AiChatReply> {
    return this.http.post<AiChatReply>(apiUrl('/ai/chat'), { messages });
  }
}
