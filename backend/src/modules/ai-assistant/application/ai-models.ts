/** Models a sede can choose for its chat. The id is what the provider expects; the label is what the sede reads. */
export interface AiModelOption {
  readonly id: string;
  readonly label: string;
  /** What the choice means for the bill of the sede, in one line. */
  readonly hint: string;
}

export const AI_MODELS: readonly AiModelOption[] = [
  {
    id: 'claude-opus-5-5',
    label: 'Claude Opus 5.5',
    hint: 'El más capaz, para preguntas complejas.',
  },
  {
    id: 'claude-sonnet-5-5',
    label: 'Claude Sonnet 5.5',
    hint: 'Equilibrado entre calidad y costo.',
  },
  {
    id: 'claude-haiku-5-5',
    label: 'Claude Haiku 5.5',
    hint: 'El más económico, para consultas sencillas.',
  },
];

export const DEFAULT_AI_MODEL = 'claude-opus-5-5';

export const AI_PROVIDER = 'ANTHROPIC';

export function isSupportedAiModel(id: string): boolean {
  return AI_MODELS.some((model) => model.id === id);
}
