import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { IconChipComponent } from '../../../../shared/ui/icon-chip.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  AttendanceForm,
  AttendanceFormValue,
  CATEGORY_HINTS,
  formCounts,
} from '../attendance-form';
import { AttendanceSession, CatalogEntry } from '../data/attendance.models';

interface CategorySegment {
  readonly code: string;
  readonly name: string;
  readonly index: number;
  readonly percent: number;
}

/** Session form: date and one headcount per category, with a live total. Sede and meeting come from the page. */
@Component({
  selector: 'app-attendance-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, IconComponent, IconChipComponent],
  templateUrl: './attendance-form.component.html',
  styleUrl: './attendance-form.component.scss',
})
export class AttendanceFormComponent {
  readonly form = input.required<AttendanceForm>();
  readonly value = input.required<AttendanceFormValue>();
  readonly categories = input.required<readonly CatalogEntry[]>();
  readonly maxHeadcount = input.required<number>();
  readonly today = input.required<string>();
  readonly total = input.required<number>();
  /** "Sede Central · Escuela Dominical": what the session being recorded belongs to. */
  readonly contextLabel = input<string | null>(null);
  readonly editing = input<AttendanceSession | null>(null);
  readonly pending = input(false);
  readonly dateWarning = input<string | null>(null);
  readonly blockedReason = input<string | null>(null);

  readonly submitted = output<void>();
  readonly cleared = output<void>();
  readonly editCancelled = output<void>();

  protected readonly hints = CATEGORY_HINTS;

  protected readonly dateError = computed(() => {
    this.value();
    const control = this.form().controls.sessionDate;
    if (control.hasError('required')) {
      return 'Selecciona una fecha válida.';
    }
    return control.hasError('futureDate')
      ? 'No puedes registrar asistencia en una fecha futura.'
      : null;
  });

  protected readonly segments = computed<CategorySegment[]>(() => {
    const total = this.total();
    const max = this.maxHeadcount();
    return formCounts(this.value(), this.categories(), max).map((count, index) => ({
      code: count.categoryCode,
      name: this.categories()[index].name,
      index,
      percent: total > 0 ? (count.headcount / total) * 100 : 0,
    }));
  });

  protected countError(code: string): string | null {
    const control = this.form().controls.counts.controls[code];
    if (!control || control.valid || !(control.dirty || control.touched)) {
      return null;
    }
    if (control.hasError('max')) {
      return `El valor supera ${this.maxHeadcount()}; revísalo.`;
    }
    return 'Ingresa un número entero mayor o igual a 0.';
  }
}
