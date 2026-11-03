import {
  ChangeDetectionStrategy,
  Component,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { NonNullableFormBuilder } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DomainError, userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { MemberDetail } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { PersonFieldsComponent } from './person-fields.component';
import { buildPersonForm, personFormValue, toPersonUpdate } from './person-form';

@Component({
  selector: 'app-person-edit-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DialogComponent, PersonFieldsComponent, ReactiveFormsModule],
  template: `
    <app-dialog [(open)]="open" title="Editar datos personales" variant="wide">
      <form id="person-edit-form" [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <div class="stack">
          @if (error(); as message) {
            <p class="alert alert--danger" role="alert">{{ message }}</p>
          }
          <app-person-fields [form]="form" [submitted]="submitted()" idPrefix="person-edit" />
        </div>
      </form>

      <div dialog-footer class="cluster">
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cancelar</button>
        <button
          type="submit"
          form="person-edit-form"
          class="btn btn--primary"
          [disabled]="pending()"
        >
          {{ pending() ? 'Guardando…' : 'Guardar cambios' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class PersonEditDialogComponent {
  private readonly repository = inject(MembersRepository);

  readonly open = model(false);
  readonly member = input.required<MemberDetail>();
  readonly saved = output<void>();

  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly submitted = signal(false);
  protected readonly form = buildPersonForm(inject(NonNullableFormBuilder));

  constructor() {
    effect(() => {
      if (!this.open()) {
        return;
      }
      const person = this.member().person;
      untracked(() => {
        this.error.set(null);
        this.submitted.set(false);
        this.form.reset(personFormValue(person));
      });
    });
  }

  protected async submit(): Promise<void> {
    this.submitted.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid || this.pending()) {
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      await firstValueFrom(
        this.repository.updatePerson(this.member().id, toPersonUpdate(this.form.getRawValue())),
      );
      this.open.set(false);
      this.saved.emit();
    } catch (error) {
      if (error instanceof DomainError && error.code === 'DUPLICATE_DOCUMENT') {
        this.form.controls.documentNumber.setErrors({ duplicate: error.message });
      }
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
