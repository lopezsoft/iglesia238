import { Observable } from 'rxjs';
import {
  AiChatMessage,
  AiChatReply,
  AiChatStatus,
  AiSettings,
  AiSettingsChanges,
  CreatedAiConnection,
  NewAiConnection,
} from './ai-assistant.models';

/**
 * Port of the AI assistant of a sede. The settings need `ai.manage` and the chat `ai.use`; both act on one sede. The
 * key the sede pastes is sent once and never comes back: only its last 4 characters do.
 */
export abstract class AiAssistantRepository {
  abstract settings(): Observable<AiSettings>;
  abstract updateSettings(changes: AiSettingsChanges): Observable<AiSettings>;
  /** The API checks the key with the provider before it keeps it. */
  abstract saveKey(apiKey: string): Observable<AiSettings>;
  /** Removing the key also turns the chat off. */
  abstract removeKey(): Observable<AiSettings>;
  abstract createConnection(connection: NewAiConnection): Observable<CreatedAiConnection>;
  abstract revokeConnection(id: number): Observable<void>;

  abstract chatStatus(): Observable<AiChatStatus>;
  /** The whole conversation, oldest first; the last message is the person's. */
  abstract ask(messages: readonly AiChatMessage[]): Observable<AiChatReply>;
}
