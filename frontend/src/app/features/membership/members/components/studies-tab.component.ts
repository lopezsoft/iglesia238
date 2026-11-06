import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { CatalogsStore } from '../../../../core/catalogs/catalogs.store';
import { userMessage } from '../../../../core/errors/domain-error';
import { catalogName } from '../../../../core/models/catalogs';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { PersonStudy, STUDY_STATUS_LABELS, StudyStatus, todayIso } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

const CURRENT_YEAR = Number(todayIso().slice(0, 4));

@Component({
  selector: 'app-studies-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    ReactiveFormsModule,
    StatusBadgeComponent,
  ],
  styleUrl: './member-tab.scss',
  templateUrl: './studies-tab.component.html',
})
export class StudiesTabComponent {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly catalogs = inject(CatalogsStore);

  readonly memberId = input.required<number>();

  protected readonly studyTypes = this.catalogs.studyTypes;
  protected readonly statusLabels = STUDY_STATUS_LABELS;
  protected readonly currentYear = CURRENT_YEAR;

  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  protected readonly command = new CommandState();
  protected readonly addOpen = signal(false);
  protected readonly editingStudyId = signal<number | null>(null);
  protected readonly confirmingId = signal<number | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    studyTypeCode: ['COURSE', Validators.required],
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(150)]],
    institution: ['', Validators.maxLength(150)],
    status: ['COMPLETED' as StudyStatus, Validators.required],
    year: [CURRENT_YEAR as number | null, [Validators.min(1940), Validators.max(CURRENT_YEAR)]],
  });

  protected readonly studies = rxResource({
    params: () => ({ memberId: this.memberId() }),
    stream: ({ params }) => this.repository.studies(params.memberId),
  });

  constructor() {
    this.catalogs.load().subscribe({ error: () => undefined });
  }

  protected readonly rows = computed(() => (this.studies.hasValue() ? this.studies.value() : []));
  protected readonly loadError = computed(() =>
    this.studies.error() ? userMessage(this.studies.error()) : null,
  );

  protected typeName(code: string): string {
    return catalogName(this.catalogs.studyTypes(), code);
  }

  protected showError(name: 'name' | 'institution' | 'year'): boolean {
    const control = this.form.controls[name];
    return control.invalid && control.touched;
  }

  protected openAdd(): void {
    this.editingStudyId.set(null);
    this.form.reset({
      studyTypeCode: 'COURSE',
      name: '',
      institution: '',
      status: 'COMPLETED',
      year: CURRENT_YEAR,
    });
    this.command.clear();
    this.addOpen.set(true);
  }

  protected openEdit(row: PersonStudy): void {
    this.editingStudyId.set(row.id);
    this.form.reset({
      studyTypeCode: row.studyTypeCode,
      name: row.name,
      institution: row.institution ?? '',
      status: row.status,
      year: row.year,
    });
    this.command.clear();
    this.addOpen.set(true);
  }

  protected async add(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const value = this.form.getRawValue();
    const year = value.year === null || `${value.year}`.trim() === '' ? null : Number(value.year);
    const payload = {
      studyTypeCode: value.studyTypeCode,
      name: value.name,
      institution: value.institution.trim() === '' ? null : value.institution,
      status: value.status,
      year,
    };
    const editingId = this.editingStudyId();
    const done = await this.command.run(
      editingId !== null
        ? this.repository.updateStudy(this.memberId(), editingId, payload)
        : this.repository.addStudy(this.memberId(), payload),
      editingId !== null ? 'Estudio actualizado.' : 'Estudio registrado.',
    );
    if (done) {
      this.addOpen.set(false);
      this.editingStudyId.set(null);
      this.studies.reload();
    }
  }

  protected async remove(studyId: number): Promise<void> {
    const done = await this.command.run(
      this.repository.removeStudy(this.memberId(), studyId),
      'Estudio eliminado.',
    );
    this.confirmingId.set(null);
    if (done) {
      this.studies.reload();
    }
  }
}
