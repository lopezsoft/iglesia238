/** Settings of a sede as the repository returns them. */
export interface AiSettingsRecord {
  readonly id: number;
  readonly congregationId: number;
  readonly chatEnabled: boolean;
  readonly mcpEnabled: boolean;
  readonly provider: string;
  readonly model: string;
  /** Encrypted; never leaves the application layer. */
  readonly apiKeyCipher: string | null;
  readonly apiKeyLast4: string | null;
}

export interface AiSettingsChanges {
  readonly chatEnabled?: boolean;
  readonly mcpEnabled?: boolean;
  readonly model?: string;
  /** `null` removes the key. */
  readonly apiKey?: { readonly cipher: string; readonly last4: string } | null;
}

export interface AiTokenRecord {
  readonly id: number;
  readonly name: string;
  readonly tokenPrefix: string;
  readonly createdByName: string | null;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
}

export interface NewAiTokenRecord {
  readonly name: string;
  readonly tokenHash: string;
  readonly tokenPrefix: string;
  readonly createdById: number;
  readonly expiresAt: Date | null;
}

/** What the MCP authentication needs to know about a token. */
export interface AiTokenAuthRecord {
  readonly id: number;
  readonly denominationId: number;
  readonly congregationId: number;
  readonly createdById: number;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly mcpEnabled: boolean;
  readonly congregationActive: boolean;
}

// ---------- Views (what the API returns) ----------

export interface AiTokenView {
  readonly id: number;
  readonly name: string;
  readonly tokenPrefix: string;
  readonly createdByName: string | null;
  readonly createdAt: string;
  readonly lastUsedAt: string | null;
  readonly expiresAt: string | null;
  readonly revokedAt: string | null;
  /** True while it can still connect. */
  readonly active: boolean;
}

export interface AiSettingsView {
  readonly congregationId: number;
  readonly congregationName: string;
  readonly chatEnabled: boolean;
  readonly mcpEnabled: boolean;
  readonly provider: string;
  readonly model: string;
  readonly models: ReadonlyArray<{
    readonly id: string;
    readonly label: string;
    readonly hint: string;
  }>;
  readonly keyConfigured: boolean;
  /** Last 4 characters of the saved key, to recognise it. */
  readonly keyLast4: string | null;
  /** Where an external AI tool connects. */
  readonly mcpUrl: string;
  readonly tokens: readonly AiTokenView[];
}

export interface CreatedAiToken extends AiTokenView {
  /** The full token: shown this once. */
  readonly token: string;
}
