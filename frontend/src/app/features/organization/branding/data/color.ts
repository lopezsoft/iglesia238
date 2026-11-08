const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isHexColor(text: string): boolean {
  return HEX_COLOR.test(text);
}

/** WCAG relative luminance of a #RRGGBB color. */
function luminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => {
    const value = parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Contrast of a #RRGGBB color against white, from 1 to 21. The same rule the server applies. */
export function contrastWithWhite(hex: string): number {
  return 1.05 / (luminance(hex) + 0.05);
}

/**
 * What is wrong with a color text, or null if it is acceptable (or blank: the default color). A hint for the form: the
 * server decides.
 */
export function colorProblem(text: string, minContrast: number): string | null {
  const color = text.trim();
  if (color === '') {
    return null;
  }
  if (!isHexColor(color)) {
    return 'Escribe el color como #RRGGBB, por ejemplo #1F56C4.';
  }
  const ratio = contrastWithWhite(color);
  if (ratio < minContrast) {
    return `Este color es demasiado claro: el texto de los documentos no se leería (contraste ${ratio.toFixed(1)}:1; el mínimo es ${minContrast}:1).`;
  }
  return null;
}
