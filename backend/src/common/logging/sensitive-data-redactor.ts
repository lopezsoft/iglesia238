const REDACTED = '[REDACTED]';
const MAX_DEPTH = 6;

const SENSITIVE_KEY_PATTERN =
  'pass(word)?|secret|token|authorization|cookie|api[-_]?key|document(number)?|email|phone|mobile|cell|whatsapp|address|birth|(full|first|last|display|guardian|spouse|father|mother|children)[-_]?name(s)?|tribunal[-_]?opinion|photo|notes|health|tax[-_]?id';

const SENSITIVE_KEY = new RegExp(SENSITIVE_KEY_PATTERN, 'i');

/** True for field names that hold credentials or personal data (also used to keep them out of audit changes). */
export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY.test(key);
}

const SENSITIVE_TEXT_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [/\b(Bearer|Basic)\s+[\w\-.~+/=]+/gi, `$1 ${REDACTED}`],
  // Credentials in URLs, including an empty user (redis://:password@host).
  [/\b(\w+:\/\/[^:/\s@]*:)[^@\s]+(@)/g, `$1${REDACTED}$2`],
  [/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, REDACTED],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, REDACTED],
  // key: value or key=value pairs inside free text.
  [
    new RegExp(
      `\\b(\\w*(?:${SENSITIVE_KEY_PATTERN})\\w*["']?\\s*[:=]\\s*)("[^"]*"|'[^']*'|[^\\s,;}]+)`,
      'gi',
    ),
    `$1${REDACTED}`,
  ],
];

function redactText(text: string): string {
  return SENSITIVE_TEXT_PATTERNS.reduce(
    (result, [pattern, replacement]) => result.replace(pattern, replacement),
    text,
  );
}

function hasToJson(value: object): value is { toJSON(): unknown } {
  return typeof (value as { toJSON?: unknown }).toJSON === 'function';
}

/** Removes credentials and personal data before anything reaches the logs. */
export function redactSensitiveData(value: unknown, depth = 0): unknown {
  if (typeof value === 'string') {
    return redactText(value);
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= MAX_DEPTH) {
    return REDACTED;
  }
  if (value instanceof Error) {
    return redactText(value.stack ?? value.message);
  }
  // Date, Decimal and similar types serialize themselves; invalid dates become null.
  if (hasToJson(value)) {
    return redactSensitiveData(value.toJSON(), depth + 1);
  }
  if (value instanceof Map || value instanceof Set) {
    return redactSensitiveData([...value], depth + 1);
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveData(item, depth + 1));
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [
      key,
      SENSITIVE_KEY.test(key) ? REDACTED : redactSensitiveData(item, depth + 1),
    ]),
  );
}
