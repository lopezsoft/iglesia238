import { signal } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';

export type CommandOutcome<T> = { readonly ok: true; readonly value: T } | { readonly ok: false };

/**
 * Pending flag, error and success message of the commands of one tab or dialog. Commands never
 * throw: the error message (already safe to show) ends up in `error`.
 */
export class CommandState {
  readonly pending = signal(false);
  readonly error = signal<string | null>(null);
  readonly message = signal<string | null>(null);

  async execute<T>(command: Observable<T>, successMessage: string): Promise<CommandOutcome<T>> {
    if (this.pending()) {
      return { ok: false };
    }
    this.pending.set(true);
    this.error.set(null);
    this.message.set(null);
    try {
      const value = await firstValueFrom(command);
      this.message.set(successMessage);
      return { ok: true, value };
    } catch (error) {
      this.error.set(userMessage(error));
      return { ok: false };
    } finally {
      this.pending.set(false);
    }
  }

  async run(command: Observable<unknown>, successMessage: string): Promise<boolean> {
    return (await this.execute(command, successMessage)).ok;
  }

  clear(): void {
    this.error.set(null);
    this.message.set(null);
  }
}
