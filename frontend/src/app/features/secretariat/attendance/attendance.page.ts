import { DOCUMENT, formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { ATTENDANCE_CATEGORIES, MEETING_TYPES, catalogName } from '../../../core/models/catalogs';
import { ErrorBannerComponent, LoadingComponent, ReadOnlyNoticeComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { buildAttendanceForm, formCounts, formTotal } from './attendance-form';
import { AttendanceFormComponent } from './components/attendance-form.component';
import { AttendanceHistoryComponent } from './components/attendance-history.component';
import { AttendanceDraft, AttendanceTrendComponent } from './components/attendance-trend.component';
import {
  AttendanceSession,
  AttendanceSessionKey,
  HISTORY_SIZE,
  WEEKDAY_NAMES,
  headcountOf,
  sessionTotal,
  weekdayOf,
} from './data/attendance.models';
import { AttendanceRepository } from './data/attendance.repository';

const SUNDAY = 0;
const EXPORT_LIMIT = 10_000;

/** D-03: headcount per category of each meeting, one session per sede, type and date. */
@Component({
  selector: 'app-attendance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    PageHeaderComponent,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
    ReadOnlyNoticeComponent,
    AttendanceFormComponent,
    AttendanceTrendComponent,
    AttendanceHistoryComponent,
  ],
  templateUrl: './attendance.page.html',
  styleUrl: './attendance.page.scss',
})
export class AttendancePage {
  private readonly repository = inject(AttendanceRepository);
  private readonly auth = inject(AuthService);
  private readonly locale = inject(LOCALE_ID);
  private readonly document = inject(DOCUMENT);

  protected readonly form = buildAttendanceForm(inject(NonNullableFormBuilder));
  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    { initialValue: this.form.getRawValue() },
  );

  protected readonly canWrite = computed(() => this.auth.can('attendance.write'));
  protected readonly editing = signal<AttendanceSession | null>(null);
  protected readonly pending = signal(false);
  protected readonly commandError = signal<string | null>(null);
  protected readonly duplicateKey = signal<AttendanceSessionKey | null>(null);
  protected readonly savedMessage = signal<string | null>(null);
  protected readonly highlightedId = signal<number | null>(null);

  protected readonly congregations = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.congregations(),
  });

  private readonly congregationId = computed(() => this.value().congregationId);
  private readonly meetingTypeCode = computed(() => this.value().meetingTypeCode);

  protected readonly history = rxResource({
    params: () => {
      const congregationId = this.congregationId();
      return congregationId === null
        ? undefined
        : { congregationId, meetingTypeCode: this.meetingTypeCode(), limit: HISTORY_SIZE };
    },
    stream: ({ params }) => this.repository.history(params),
  });

  protected readonly congregationName = computed(() => {
    const id = this.congregationId();
    const sedes = this.congregations.hasValue() ? this.congregations.value() : [];
    return sedes.find((sede) => sede.id === id)?.name ?? null;
  });

  protected readonly meetingTypeName = computed(() => catalogName(MEETING_TYPES, this.meetingTypeCode()));
  protected readonly total = computed(() => formTotal(this.value()));

  protected readonly dateWarning = computed(() => {
    const { sessionDate, meetingTypeCode } = this.value();
    if (!sessionDate || meetingTypeCode !== 'SUNDAY_SCHOOL' || this.form.controls.sessionDate.invalid) {
      return null;
    }
    const weekday = weekdayOf(sessionDate);
    return weekday === SUNDAY
      ? null
      : `La fecha elegida es ${WEEKDAY_NAMES[weekday]}. La Escuela Dominical normalmente se registra en domingo.`;
  });

  protected readonly blockedReason = computed(() => {
    this.value();
    const controls = this.form.controls;
    if (!this.canWrite()) {
      return 'Tu rol no tiene el permiso attendance.write.';
    }
    if (controls.congregationId.invalid) {
      return 'Selecciona la sede de la reunión.';
    }
    if (controls.sessionDate.invalid) {
      return 'Corrige la fecha para poder guardar.';
    }
    if (controls.counts.invalid) {
      return 'Corrige los valores marcados en rojo.';
    }
    return this.total() === 0 ? 'Ingresa al menos un asistente.' : null;
  });

  protected readonly draft = computed<AttendanceDraft | null>(() =>
    this.blockedReason() === null && this.editing() === null
      ? { sessionDate: this.value().sessionDate, total: this.total() }
      : null,
  );

  constructor() {
    // Keeps the sede valid for the active scope: fixed for a sede role, chosen otherwise.
    effect(() => {
      if (!this.congregations.hasValue()) {
        return;
      }
      const sedes = this.congregations.value();
      untracked(() => {
        this.stopEditing();
        const control = this.form.controls.congregationId;
        if (sedes.length === 1) {
          control.setValue(sedes[0].id);
        } else if (!sedes.some((sede) => sede.id === control.value)) {
          control.setValue(null);
        }
      });
    });
  }

  protected async save(): Promise<void> {
    if (this.blockedReason() !== null || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const editing = this.editing();
    const counts = formCounts(value);
    this.pending.set(true);
    this.commandError.set(null);
    this.duplicateKey.set(null);
    this.savedMessage.set(null);
    try {
      const saved = editing
        ? await firstValueFrom(this.repository.update(editing.id, counts))
        : await firstValueFrom(
            this.repository.create({
              congregationId: value.congregationId as number,
              meetingTypeCode: value.meetingTypeCode,
              sessionDate: value.sessionDate,
              attendanceCounts: counts,
            }),
          );
      this.savedMessage.set(
        `Asistencia de ${this.meetingTypeName()} del ${this.formatDay(saved.sessionDate)} ${editing ? 'corregida' : 'guardada'}: ${sessionTotal(saved)} asistentes.`,
      );
      this.highlightedId.set(saved.id);
      this.stopEditing();
      this.history.reload();
    } catch (error) {
      if (error instanceof DomainError && error.code === 'DUPLICATE_SESSION') {
        this.duplicateKey.set({
          congregationId: value.congregationId as number,
          meetingTypeCode: value.meetingTypeCode,
          sessionDate: value.sessionDate,
        });
      }
      this.commandError.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }

  protected async loadDuplicate(): Promise<void> {
    const key = this.duplicateKey();
    if (!key) {
      return;
    }
    try {
      const session = await firstValueFrom(this.repository.find(key));
      if (session) {
        this.startEditing(session);
      } else {
        this.commandError.set('La sesión ya no existe. Intenta guardar de nuevo.');
        this.duplicateKey.set(null);
      }
    } catch (error) {
      this.commandError.set(userMessage(error));
    }
  }

  protected startEditing(session: AttendanceSession): void {
    this.commandError.set(null);
    this.duplicateKey.set(null);
    this.savedMessage.set(null);
    this.editing.set(session);
    const { controls } = this.form;
    controls.meetingTypeCode.setValue(session.meetingTypeCode);
    controls.sessionDate.setValue(session.sessionDate);
    controls.congregationId.setValue(session.congregationId);
    for (const category of ATTENDANCE_CATEGORIES) {
      controls.counts.controls[category.code]?.setValue(headcountOf(session, category.code));
    }
    controls.meetingTypeCode.disable();
    controls.sessionDate.disable();
    controls.congregationId.disable();
  }

  protected stopEditing(): void {
    const wasEditing = this.editing() !== null;
    this.editing.set(null);
    const { controls } = this.form;
    controls.meetingTypeCode.enable();
    controls.sessionDate.enable();
    controls.congregationId.enable();
    if (wasEditing) {
      this.clearCounts();
    }
  }

  protected clearCounts(): void {
    this.form.controls.counts.reset();
    this.commandError.set(null);
    this.duplicateKey.set(null);
  }

  /** Downloads every session of the sede and meeting type as CSV (Excel-friendly, UTF-8 BOM). */
  protected async exportHistory(): Promise<void> {
    const congregationId = this.congregationId();
    if (congregationId === null) {
      return;
    }
    try {
      const { sessions } = await firstValueFrom(
        this.repository.history({ congregationId, meetingTypeCode: this.meetingTypeCode(), limit: EXPORT_LIMIT }),
      );
      const header = ['Fecha', ...ATTENDANCE_CATEGORIES.map((category) => category.name), 'Total'];
      const rows = sessions.map((session) => [
        session.sessionDate,
        ...ATTENDANCE_CATEGORIES.map((category) => String(headcountOf(session, category.code))),
        String(sessionTotal(session)),
      ]);
      const csv = [header, ...rows].map((row) => row.join(';')).join('\r\n');
      this.download(`asistencia-${this.meetingTypeCode().toLowerCase()}.csv`, `﻿${csv}`);
    } catch (error) {
      this.commandError.set(userMessage(error));
    }
  }

  private download(fileName: string, content: string): void {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
    const link = this.document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
  }

  private formatDay(isoDate: string): string {
    return formatDate(isoDate, 'dd/MM/yyyy', this.locale);
  }
}
