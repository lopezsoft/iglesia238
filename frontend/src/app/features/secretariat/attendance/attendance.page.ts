import { formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  LOCALE_ID,
  computed,
  effect,
  inject,
  linkedSignal,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom, map } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { DialogComponent } from '../../../shared/ui/dialog.component';
import { ExportActionsComponent, ExportFormat } from '../../../shared/ui/export-actions.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { PageHeaderComponent } from '../../../shared/ui/page-header.component';
import { SectionPanelComponent } from '../../../shared/ui/section-panel.component';
import {
  SegmentedControlComponent,
  SegmentOption,
} from '../../../shared/ui/segmented-control.component';
import { StatCardComponent } from '../../../shared/ui/stat-card.component';
import { FileDownloadService } from '../../../shared/utils/file-download.service';
import {
  buildAttendanceForm,
  configureAttendanceForm,
  formCounts,
  formTotal,
} from './attendance-form';
import { AttendanceFormComponent } from './components/attendance-form.component';
import { AttendanceHistoryComponent } from './components/attendance-history.component';
import {
  AttendanceDraft,
  AttendanceTrendComponent,
  TrendPoint,
} from './components/attendance-trend.component';
import {
  AttendanceFilter,
  AttendanceSession,
  AttendanceSessionKey,
  HISTORY_PAGE_SIZE,
  TREND_SESSIONS,
  WEEKDAY_NAMES,
  headcountOf,
  periodLabel,
  weekdayOf,
} from './data/attendance.models';
import { AttendanceRepository } from './data/attendance.repository';

type TrendMode = 'sessions' | 'month' | 'year';

const SUNDAY = 0;

const TREND_MODES: readonly SegmentOption[] = [
  { value: 'sessions', label: 'Sesiones' },
  { value: 'month', label: 'Mensual' },
  { value: 'year', label: 'Anual' },
];

/** D-03: headcount per category of each meeting, one session per sede, type and date. */
@Component({
  selector: 'app-attendance-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    PageHeaderComponent,
    StatCardComponent,
    SectionPanelComponent,
    SegmentedControlComponent,
    ExportActionsComponent,
    IconComponent,
    DialogComponent,
    LoadingComponent,
    ErrorBannerComponent,
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
  private readonly downloads = inject(FileDownloadService);

  protected readonly form = buildAttendanceForm(inject(NonNullableFormBuilder));
  protected readonly value = toSignal(
    this.form.valueChanges.pipe(map(() => this.form.getRawValue())),
    {
      initialValue: this.form.getRawValue(),
    },
  );

  protected readonly trendModes = TREND_MODES;
  protected readonly trendMode = signal<TrendMode>('sessions');
  protected readonly editing = signal<AttendanceSession | null>(null);
  protected readonly pending = signal(false);
  protected readonly commandError = signal<string | null>(null);
  protected readonly duplicateKey = signal<AttendanceSessionKey | null>(null);
  protected readonly savedMessage = signal<string | null>(null);
  protected readonly highlightedId = signal<number | null>(null);
  protected readonly exporting = signal(false);

  protected readonly from = signal<string | null>(null);
  protected readonly to = signal<string | null>(null);
  protected readonly deleting = signal<AttendanceSession | null>(null);
  protected readonly deleteOpen = signal(false);
  protected readonly deletePending = signal(false);
  protected readonly deleteError = signal<string | null>(null);

  protected readonly options = rxResource({
    params: () => this.auth.tenant(),
    stream: () => this.repository.options(),
  });

  /** The values of the resources, null while loading or when the call failed (reading a failed resource throws). */
  protected readonly optionsData = computed(() =>
    this.options.hasValue() ? this.options.value() : null,
  );
  protected readonly historyData = computed(() =>
    this.history.hasValue() ? this.history.value() : null,
  );
  protected readonly statsData = computed(() =>
    this.stats.hasValue() ? this.stats.value() : null,
  );

  protected readonly congregationId = computed(() => this.value().congregationId);
  protected readonly meetingTypeCode = computed(() => this.value().meetingTypeCode || null);
  private readonly ready = computed(
    () => this.congregationId() !== null && this.meetingTypeCode() !== null,
  );

  /** Sede and meeting type: they scope the form, the history, the trend and the export. */
  private readonly scopeFilter = computed<AttendanceFilter>(() => ({
    congregationId: this.congregationId(),
    meetingTypeCode: this.meetingTypeCode(),
  }));
  protected readonly rangeFilter = computed<AttendanceFilter>(() => ({
    ...this.scopeFilter(),
    from: this.from(),
    to: this.to(),
  }));
  protected readonly hasRange = computed(() => this.from() !== null || this.to() !== null);

  protected readonly historyPage = linkedSignal<AttendanceFilter, number>({
    source: this.rangeFilter,
    computation: () => 1,
  });

  protected readonly history = rxResource({
    params: () =>
      this.ready()
        ? { ...this.rangeFilter(), page: this.historyPage(), pageSize: HISTORY_PAGE_SIZE }
        : undefined,
    stream: ({ params }) => this.repository.list(params),
  });

  /** The latest sessions of the sede and meeting type, whatever the date range, for the trend. */
  protected readonly recent = rxResource({
    params: () =>
      this.ready() ? { ...this.scopeFilter(), page: 1, pageSize: TREND_SESSIONS } : undefined,
    stream: ({ params }) => this.repository.list(params),
  });

  protected readonly stats = rxResource({
    params: () =>
      this.ready()
        ? {
            ...this.rangeFilter(),
            groupBy: this.trendMode() === 'year' ? ('year' as const) : ('month' as const),
          }
        : undefined,
    stream: ({ params }) => this.repository.stats(params),
  });

  protected readonly categories = computed(() => this.optionsData()?.categories ?? []);
  protected readonly maxHeadcount = computed(() => this.optionsData()?.maxHeadcount ?? 2000);
  protected readonly today = computed(() => this.optionsData()?.today ?? '');
  protected readonly congregationName = computed(() => {
    const id = this.congregationId();
    return this.optionsData()?.congregations.find((sede) => sede.id === id)?.name ?? null;
  });
  protected readonly meetingTypeName = computed(() => {
    const code = this.meetingTypeCode();
    return this.optionsData()?.meetingTypes.find((type) => type.code === code)?.name ?? null;
  });
  protected readonly contextLabel = computed(() => {
    const parts = [this.congregationName(), this.meetingTypeName()].filter(
      (part): part is string => !!part,
    );
    return parts.length === 2 ? parts.join(' · ') : null;
  });

  protected readonly total = computed(() =>
    formTotal(this.value(), this.categories(), this.maxHeadcount()),
  );

  protected readonly dateWarning = computed(() => {
    const { sessionDate, meetingTypeCode } = this.value();
    if (
      !sessionDate ||
      meetingTypeCode !== 'SUNDAY_SCHOOL' ||
      this.form.controls.sessionDate.invalid
    ) {
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
    if (controls.congregationId.invalid) {
      return 'Selecciona la sede de la reunión.';
    }
    if (controls.meetingTypeCode.invalid) {
      return 'Selecciona el tipo de reunión.';
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
    this.blockedReason() === null && this.editing() === null && this.trendMode() === 'sessions'
      ? { label: formatDate(this.value().sessionDate, 'd MMM', this.locale), total: this.total() }
      : null,
  );

  protected readonly trendPoints = computed<TrendPoint[]>(() => {
    if (this.trendMode() === 'sessions') {
      const sessions = this.recent.hasValue() ? [...this.recent.value().items].reverse() : [];
      return sessions.map((session) => ({
        key: String(session.id),
        label: formatDate(session.sessionDate, 'd MMM', this.locale),
        total: session.total,
      }));
    }
    const series = this.statsData()?.series ?? [];
    return series.map((point) => ({
      key: point.period,
      label: periodLabel(point.period),
      total: point.total,
    }));
  });

  protected readonly trendTitle = computed(() => {
    const name = this.meetingTypeName() ?? 'la reunión';
    return this.trendMode() === 'sessions'
      ? `Tendencia · ${name}`
      : `Evolución ${this.trendMode() === 'month' ? 'mensual' : 'anual'} · ${name}`;
  });
  protected readonly trendSubtitle = computed(() => {
    const mode = this.trendMode();
    if (mode === 'sessions') {
      return `Total de asistentes en las últimas ${this.trendPoints().length} sesiones registradas`;
    }
    return mode === 'month'
      ? 'Suma de asistentes por mes en el rango elegido'
      : 'Suma de asistentes por año';
  });

  protected readonly yearComparison = computed(() => {
    const comparison = this.statsData()?.yearOverYear ?? null;
    if (!comparison || comparison.changePercent === null) {
      return 'Sin comparativo';
    }
    const sign = comparison.changePercent > 0 ? '+' : '';
    return `${sign}${comparison.changePercent.toLocaleString(this.locale)} %`;
  });

  constructor() {
    // Adapts the form to the options of the API and keeps the sede valid for the active scope.
    effect(() => {
      const options = this.optionsData();
      if (!options) {
        return;
      }
      untracked(() => {
        configureAttendanceForm(this.form, options);
        this.stopEditing();
        const control = this.form.controls.congregationId;
        if (options.congregations.length === 1) {
          control.setValue(options.congregations[0].id);
        } else if (!options.congregations.some((sede) => sede.id === control.value)) {
          control.setValue(null);
        }
      });
    });
  }

  protected setDate(which: 'from' | 'to', raw: string): void {
    (which === 'from' ? this.from : this.to).set(raw === '' ? null : raw);
  }

  protected clearRange(): void {
    this.from.set(null);
    this.to.set(null);
  }

  protected async save(): Promise<void> {
    if (this.blockedReason() !== null || this.pending()) {
      this.form.markAllAsTouched();
      return;
    }
    const value = this.form.getRawValue();
    const editing = this.editing();
    const counts = formCounts(value, this.categories(), this.maxHeadcount());
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
        `Asistencia de ${saved.meetingTypeName} del ${this.formatDay(saved.sessionDate)} ${editing ? 'corregida' : 'guardada'}: ${saved.total} asistentes.`,
      );
      this.highlightedId.set(saved.id);
      this.stopEditing();
      this.reloadAll();
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
    for (const category of this.categories()) {
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

  protected askDelete(session: AttendanceSession): void {
    this.deleteError.set(null);
    this.deleting.set(session);
    this.deleteOpen.set(true);
  }

  protected async confirmDelete(): Promise<void> {
    const session = this.deleting();
    if (!session || this.deletePending()) {
      return;
    }
    this.deletePending.set(true);
    this.deleteError.set(null);
    try {
      await firstValueFrom(this.repository.remove(session.id));
      this.deleteOpen.set(false);
      if (this.editing()?.id === session.id) {
        this.stopEditing();
      }
      this.highlightedId.set(null);
      this.savedMessage.set(`Se eliminó la sesión del ${this.formatDay(session.sessionDate)}.`);
      this.reloadAll();
    } catch (error) {
      this.deleteError.set(userMessage(error));
    } finally {
      this.deletePending.set(false);
    }
  }

  /** Downloads the sessions that match the filters, as a printable sheet (PDF) or a spreadsheet (CSV), both generated by the API. */
  protected async download(format: ExportFormat): Promise<void> {
    if (this.exporting() || (format !== 'pdf' && format !== 'csv')) {
      return;
    }
    this.exporting.set(true);
    this.commandError.set(null);
    try {
      const filter = this.rangeFilter();
      const blob = await firstValueFrom(format === 'pdf' ? this.repository.exportPdf(filter) : this.repository.exportCsv(filter));
      this.downloads.save(blob, `asistencia-${(this.meetingTypeCode() ?? 'todas').toLowerCase()}.${format}`);
    } catch (error) {
      this.commandError.set(userMessage(error));
    } finally {
      this.exporting.set(false);
    }
  }

  protected formatDay(isoDate: string): string {
    return formatDate(isoDate, 'dd/MM/yyyy', this.locale);
  }

  private reloadAll(): void {
    this.history.reload();
    this.recent.reload();
    this.stats.reload();
  }
}
