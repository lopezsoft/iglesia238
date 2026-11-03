import { createInterface } from 'node:readline/promises';

const CTRL_C = '\u0003';
const CTRL_D = '\u0004';
const BACKSPACE = '\u007f';
const BACKSPACE_WINDOWS = '\b';

/** Reads a visible line from the terminal. */
export async function promptLine(question: string): Promise<string> {
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  try {
    return (await lines.question(question)).trim();
  } finally {
    lines.close();
  }
}

/** Reads a secret from the terminal without echoing it. It needs a TTY: it cannot be piped. */
export function promptHidden(question: string): Promise<string> {
  const { stdin, stdout } = process;
  if (!stdin.isTTY) {
    return Promise.reject(
      new Error('A terminal is needed to type the password without showing it'),
    );
  }

  stdout.write(question);
  return new Promise((resolve, reject) => {
    let typed = '';

    const finish = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.removeListener('data', onData);
      stdout.write('\n');
    };

    const onData = (chunk: Buffer): void => {
      for (const character of chunk.toString('utf8')) {
        if (character === '\r' || character === '\n' || character === CTRL_D) {
          finish();
          resolve(typed);
          return;
        }
        if (character === CTRL_C) {
          finish();
          reject(new Error('Cancelled'));
          return;
        }
        if (character === BACKSPACE || character === BACKSPACE_WINDOWS) {
          typed = typed.slice(0, -1);
        } else {
          typed += character;
        }
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
