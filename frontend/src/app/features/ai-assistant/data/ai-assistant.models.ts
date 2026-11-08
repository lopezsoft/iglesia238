/** A model the sede can pick for its chat; the hint says what the choice means for its bill. */
export interface AiModelOption {
  readonly id: string;
  readonly label: string;
  readonly hint: string;
}

/** A connection of an external AI tool to the data of the sede (MCP). The token itself is never listed. */
export interface AiConnection {
  readonly id: number;
  readonly name: string;
  /** First characters of the token, to recognise it. */
  readonly tokenPrefix: string;
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  /** True while it can still connect. */
  readonly active: boolean;
}

/** The response that creates a connection: the only time the full token is shown. */
export interface CreatedAiConnection extends AiConnection {
  readonly token: string;
}

export interface AiSettings {
  readonly congregationId: number;
  readonly congregationName: string;
  readonly chatEnabled: boolean;
  readonly mcpEnabled: boolean;
  readonly provider: string;
  readonly model: string;
  readonly models: readonly AiModelOption[];
  readonly keyConfigured: boolean;
  /** Last 4 characters of the saved key; the key itself never comes back. */
  readonly keyLast4: string | null;
  /** Where an external AI tool connects. */
  readonly mcpUrl: string;
  readonly tokens: readonly AiConnection[];
}

export interface AiSettingsChanges {
  readonly chatEnabled?: boolean;
  readonly mcpEnabled?: boolean;
  readonly model?: string;
}

export interface NewAiConnection {
  readonly name: string;
  /** Days until it stops working; omitted, it does not expire. */
  readonly expiresInDays?: number;
}

export interface AiChatMessage {
  readonly role: 'user' | 'assistant';
  readonly content: string;
}

export type AiUnavailableReason = 'DISABLED' | 'NO_KEY' | 'NO_TOOLS';

export interface AiConsultation {
  readonly name: string;
  readonly title: string;
}

export interface AiChatStatus {
  readonly available: boolean;
  readonly reason: AiUnavailableReason | null;
  readonly model: string;
  /** What the person can ask about: the tools of the screens they can open. */
  readonly tools: readonly AiConsultation[];
}

export interface AiChatReply {
  readonly reply: string;
  /** The consultations the assistant made to answer. */
  readonly consulted: readonly AiConsultation[];
  readonly model: string;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number };
}
