import { Transform } from 'class-transformer';

/** Trims and collapses inner whitespace of a string property; other types pass through. */
export const NormalizedText = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : value,
  );

/** Same as NormalizedText, and an empty string becomes null (optional text fields). */
export const NormalizedOptionalText = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) => {
    if (typeof value !== 'string') {
      return value;
    }
    const text = value.trim().replace(/\s+/g, ' ');
    return text === '' ? null : text;
  });

/** Lower-cases and trims an email address. */
export const NormalizedEmail = (): PropertyDecorator =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  );
