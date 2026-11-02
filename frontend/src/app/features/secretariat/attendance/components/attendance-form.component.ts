import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ATTENDANCE_CATEGORIES, MEETING_TYPES } from '../../../../core/models/catalogs';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  AttendanceForm,
  AttendanceFormValue,
  CATEGORY_HINTS,
  formCounts,
} from '../attendance-form';
import { AttendanceCongregation, AttendanceSession, MAX_HEADCOUNT, todayIso } from '../data/attendance.models';

interface CategorySegment {
  readonly code: string;
  readonly name: string;
  readonly index: number;
  readonly percent: number;
}

/** Session form: meeting type, date, sede and one headcount per category, with a live total. */
@Component({
  selector: 'app-attendance-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, DecimalPipe, IconComponent],
  templateUrl: './attendance-form.component.html',
  styleUrl: './attendance-form.component.scss',
})
export class AttendanceFormComponent {
  readonly form = input.required<AttendanceForm>();
  readonly value = input.required<AttendanceFormValue>();
  readonly congregations = input.required<readonly AttendanceCongregation[]>();
  readonly total = input.required<number>();
  readonly editing = input<AttendanceSession | null>(null);
  readonly pending = input(false);
  readonly dateWarning = input<string | null>(null);
  readonly blockedReason = input<string | null>(null);

  readonly submitted = output<void>();
  readonly cleared = output<void>();
  readonly editCancelled = output<void>();

  protected readonly meetingTypes = MEETING_TYPES;
  protected readonly categories = ATTENDANCE_CATEGORIES;
  protected readonly hints = CATEGORY_HINTS;
  protected readonly maxHeadcount = MAX_HEADCOUNT;
  protected readonly today = todayIso();

  protected readonly fixedCongregation = computed(() =>
    this.congregations().length === 1 ? this.congregations()[0] : null,
  );

  protected readonly dateError = computed(() => {
    this.value();
    const control = this.form().controls.sessionDate;
    if (control.hasError('required')) {
      return 'Selecciona una fecha válida.';
    }
    return control.hasError('futureDate') ? 'No puedes registrar asistencia en una fecha futura.' : null;
  });

  protected readonly segments = computed<CategorySegment[]>(() => {
    const total = this.total();
    return formCounts(this.value()).map((count, index) => ({
      code: count.categoryCode,
      name: this.categories[index].name,
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
      return `El valor supera ${MAX_HEADCOUNT}; revísalo.`;
    }
    return 'Ingresa un número entero mayor o igual a 0.';
  }
}
