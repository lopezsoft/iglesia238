// Pure rules to print an amount of money on a document: "$1.250.000" and "un millón doscientos cincuenta mil pesos".

const UNDER_30 = [
  'cero',
  'uno',
  'dos',
  'tres',
  'cuatro',
  'cinco',
  'seis',
  'siete',
  'ocho',
  'nueve',
  'diez',
  'once',
  'doce',
  'trece',
  'catorce',
  'quince',
  'dieciséis',
  'diecisiete',
  'dieciocho',
  'diecinueve',
  'veinte',
  'veintiuno',
  'veintidós',
  'veintitrés',
  'veinticuatro',
  'veinticinco',
  'veintiséis',
  'veintisiete',
  'veintiocho',
  'veintinueve',
] as const;

const TENS = [
  '',
  '',
  '',
  'treinta',
  'cuarenta',
  'cincuenta',
  'sesenta',
  'setenta',
  'ochenta',
  'noventa',
] as const;

const HUNDREDS = [
  '',
  'ciento',
  'doscientos',
  'trescientos',
  'cuatrocientos',
  'quinientos',
  'seiscientos',
  'setecientos',
  'ochocientos',
  'novecientos',
] as const;

/** Largest amount in pesos the words support (999.999.999.999). */
export const MAX_AMOUNT_PESOS = 999_999_999_999;

/** "uno" -> "un", "veintiuno" -> "veintiún": the number is always followed by a noun (mil, millones, pesos). */
function beforeNoun(words: string): string {
  if (words.endsWith('veintiuno')) {
    return `${words.slice(0, -'veintiuno'.length)}veintiún`;
  }
  return words.endsWith('uno') ? words.slice(0, -1) : words;
}

function belowHundred(n: number): string {
  if (n < 30) {
    return UNDER_30[n];
  }
  const unit = n % 10;
  return unit === 0
    ? TENS[n / 10]
    : `${TENS[Math.floor(n / 10)]} y ${UNDER_30[unit]}`;
}

/** 1..999. */
function belowThousand(n: number): string {
  if (n === 100) {
    return 'cien';
  }
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  return [HUNDREDS[hundreds], rest > 0 ? belowHundred(rest) : '']
    .filter(Boolean)
    .join(' ');
}

/** 1..999.999, ready to be followed by a noun. */
function belowMillion(n: number): string {
  const thousands = Math.floor(n / 1000);
  const rest = n % 1000;
  const thousandsWords =
    thousands === 0
      ? ''
      : thousands === 1
        ? 'mil'
        : `${beforeNoun(belowThousand(thousands))} mil`;
  const restWords = rest === 0 ? '' : beforeNoun(belowThousand(rest));
  return [thousandsWords, restWords].filter(Boolean).join(' ');
}

/** The words of a whole number of pesos (1..MAX_AMOUNT_PESOS), without the noun. */
function pesosInWords(pesos: number): {
  words: string;
  exactMillions: boolean;
} {
  const millions = Math.floor(pesos / 1_000_000);
  const rest = pesos % 1_000_000;
  const millionsWords =
    millions === 0
      ? ''
      : millions === 1
        ? 'un millón'
        : `${belowMillion(millions)} millones`;
  const restWords = rest === 0 ? '' : belowMillion(rest);
  return {
    words: [millionsWords, restWords].filter(Boolean).join(' '),
    exactMillions: millions > 0 && rest === 0,
  };
}

/**
 * "un millón doscientos cincuenta mil pesos colombianos", with the cents when there are any. The amount comes
 * in cents (an integer), so no floating point error reaches a document.
 */
export function amountInWords(totalCents: number): string {
  if (!Number.isSafeInteger(totalCents) || totalCents < 0) {
    throw new RangeError(
      'The amount must be a non-negative whole number of cents',
    );
  }
  const pesos = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  if (pesos > MAX_AMOUNT_PESOS) {
    throw new RangeError('The amount is too large to be written in words');
  }

  let text: string;
  if (pesos === 0) {
    text = cents === 0 ? 'cero pesos colombianos' : '';
  } else {
    const { words, exactMillions } = pesosInWords(pesos);
    const noun =
      pesos === 1
        ? 'peso colombiano'
        : exactMillions
          ? 'de pesos colombianos'
          : 'pesos colombianos';
    text = `${words} ${noun}`;
  }
  if (cents > 0) {
    const centsWords = `${beforeNoun(belowHundred(cents))} ${cents === 1 ? 'centavo' : 'centavos'}`;
    text = text === '' ? centsWords : `${text} con ${centsWords}`;
  }
  return text;
}

/** "$1.250.000", or "$1.250.000,50" when there are cents: the Colombian way to write pesos. */
export function formatPesos(totalCents: number): string {
  const pesos = Math.floor(totalCents / 100);
  const cents = totalCents % 100;
  const grouped = String(pesos).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return cents === 0
    ? `$${grouped}`
    : `$${grouped},${String(cents).padStart(2, '0')}`;
}
