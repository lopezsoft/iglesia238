import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { MEMBER_STATUS_LABELS, Sex } from '../../../../core/models/membership.model';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  FAMILY_RELATION_LABELS,
  FAMILY_RELATION_TYPES,
  FamilyRelationType,
  FamilyRelationView,
  MemberDetail,
  todayIso,
} from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

type RelativeSourceMode = 'NEW' | 'EXISTING';

@Component({
  selector: 'app-family-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    ReactiveFormsModule,
    RouterLink,
  ],
  styleUrl: './member-tab.scss',
  templateUrl: './family-tab.component.html',
})
export class FamilyTabComponent {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly memberId = input.required<number>();
  readonly member = input<MemberDetail | null>(null);
  readonly editPerson = output<void>();

  protected readonly today = todayIso();
  protected readonly relationLabels = FAMILY_RELATION_LABELS;
  protected readonly relationTypes = FAMILY_RELATION_TYPES;
  protected readonly statusLabels = MEMBER_STATUS_LABELS;

  protected readonly canWrite = computed(() => this.auth.can('members.write'));

  protected readonly command = new CommandState();
  protected readonly addOpen = signal(false);
  protected readonly editOpen = signal(false);
  protected readonly editingRelationId = signal<number | null>(null);
  protected readonly sourceMode = signal<RelativeSourceMode>('NEW');
  protected readonly searchText = signal('');
  protected readonly confirmingId = signal<number | null>(null);

  protected readonly marriageTypes = computed(() => {
    const person = this.member()?.person;
    if (!person) {
      return '—';
    }
    const types: string[] = [];
    if (person.marriageIsCivil) {
      types.push('Civil');
    }
    if (person.marriageIsChristian) {
      types.push('Cristiano');
    }
    if (person.marriageIsCatholic) {
      types.push('Católico');
    }
    return types.length > 0 ? types.join(', ') : '—';
  });

  protected readonly form = this.fb.group({
    type: ['CHILD' as FamilyRelationType, Validators.required],
    relativeId: [0],
    firstName: ['', Validators.maxLength(100)],
    lastName: ['', Validators.maxLength(80)],
    secondLastName: ['', Validators.maxLength(80)],
    sex: ['' as Sex | ''],
    birthDate: [''],
  });

  protected readonly editForm = this.fb.group({
    type: ['CHILD' as FamilyRelationType, Validators.required],
    firstName: ['', [Validators.required, Validators.maxLength(100)]],
    lastName: ['', Validators.maxLength(80)],
    secondLastName: ['', Validators.maxLength(80)],
    sex: ['' as Sex | ''],
    birthDate: [''],
  });

  protected readonly relations = rxResource({
    params: () => ({ memberId: this.memberId() }),
    stream: ({ params }) => this.repository.family(params.memberId),
  });

  protected readonly candidates = rxResource({
    params: () =>
      this.addOpen() && this.sourceMode() === 'EXISTING' && this.searchText().trim().length >= 2
        ? { memberId: this.memberId(), text: this.searchText() }
        : undefined,
    stream: ({ params }) => this.repository.searchRelatives(params.memberId, params.text),
  });

  protected readonly rows = computed(() =>
    this.relations.hasValue() ? this.relations.value() : [],
  );
  protected readonly options = computed(() =>
    this.candidates.hasValue() ? (this.candidates.value() ?? []) : [],
  );
  protected readonly loadError = computed(() =>
    this.relations.error() ? userMessage(this.relations.error()) : null,
  );
  protected readonly searchError = computed(() =>
    this.candidates.error() ? userMessage(this.candidates.error()) : null,
  );

  protected setSourceMode(mode: RelativeSourceMode): void {
    this.sourceMode.set(mode);
    this.command.clear();
  }

  protected openAdd(): void {
    this.form.reset({
      type: 'CHILD',
      relativeId: 0,
      firstName: '',
      lastName: '',
      secondLastName: '',
      sex: '',
      birthDate: '',
    });
    this.sourceMode.set('NEW');
    this.searchText.set('');
    this.command.clear();
    this.addOpen.set(true);
  }

  protected openEdit(row: FamilyRelationView): void {
    this.editingRelationId.set(row.id);
    this.editForm.reset({
      type: row.type,
      firstName: row.firstName ?? row.fullName ?? '',
      lastName: row.lastName ?? '',
      secondLastName: row.secondLastName ?? '',
      sex: row.sex ?? '',
      birthDate: row.birthDate ?? '',
    });
    this.command.clear();
    this.editOpen.set(true);
  }

  protected onSearch(text: string): void {
    this.searchText.set(text);
    this.form.controls.relativeId.setValue(0);
  }

  protected async add(): Promise<void> {
    this.form.markAllAsTouched();
    const raw = this.form.getRawValue();
    const optional = (v: string): string | null => (v.trim() === '' ? null : v.trim());

    if (this.sourceMode() === 'EXISTING') {
      if (!raw.relativeId || Number(raw.relativeId) < 1) {
        this.form.controls.relativeId.setErrors({ required: true });
        return;
      }
      const done = await this.command.run(
        this.repository.addFamilyRelation(this.memberId(), {
          relativeId: Number(raw.relativeId),
          type: raw.type,
        }),
        'Parentesco agregado.',
      );
      if (done) {
        this.addOpen.set(false);
        this.relations.reload();
      }
      return;
    }

    if (!raw.firstName.trim()) {
      this.form.controls.firstName.setErrors({ required: true });
      return;
    }
    const done = await this.command.run(
      this.repository.addFamilyRelation(this.memberId(), {
        type: raw.type,
        firstName: raw.firstName.trim(),
        lastName: optional(raw.lastName),
        secondLastName: optional(raw.secondLastName),
        sex: raw.sex === '' ? null : raw.sex,
        birthDate: optional(raw.birthDate),
      }),
      'Familiar registrado.',
    );
    if (done) {
      this.addOpen.set(false);
      this.relations.reload();
    }
  }

  protected async saveEdit(): Promise<void> {
    this.editForm.markAllAsTouched();
    const relationId = this.editingRelationId();
    if (this.editForm.invalid || relationId === null) {
      return;
    }
    const raw = this.editForm.getRawValue();
    const optional = (v: string): string | null => (v.trim() === '' ? null : v.trim());
    const done = await this.command.run(
      this.repository.updateFamilyRelation(this.memberId(), relationId, {
        type: raw.type,
        firstName: raw.firstName.trim(),
        lastName: optional(raw.lastName),
        secondLastName: optional(raw.secondLastName),
        sex: raw.sex === '' ? null : raw.sex,
        birthDate: optional(raw.birthDate),
      }),
      'Familiar actualizado.',
    );
    if (done) {
      this.editOpen.set(false);
      this.editingRelationId.set(null);
      this.relations.reload();
    }
  }

  protected async remove(relationId: number): Promise<void> {
    const done = await this.command.run(
      this.repository.removeFamilyRelation(this.memberId(), relationId),
      'Parentesco quitado.',
    );
    this.confirmingId.set(null);
    if (done) {
      this.relations.reload();
    }
  }
}
