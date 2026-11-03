/** "Ana María Pérez Gómez" from the parts the forms collect; empty parts are skipped. */
export function composeFullName(
  ...parts: readonly (string | null | undefined)[]
): string {
  return parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part)
    .join(' ');
}
