import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { MEMBER_STATUS_LABELS } from '../../../../core/models/membership.model';
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
  documentLabel,
} from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

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

  readonly memberId = input.required<number>();

  protected readonly relationLabels = FAMILY_RELATION_LABELS;
  protected readonly relationTypes = FAMILY_RELATION_TYPES;
  protected readonly statusLabels = MEMBER_STATUS_LABELS;
  protected readonly documentLabel = documentLabel;

  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  /** Registros de secretaría (where Matrimonio lives) requires the same permission. */
  protected readonly canOpenRecords = computed(() => this.auth.can('members.write'));

  protected readonly command = new CommandState();
  protected readonly addOpen = signal(false);
  protected readonly searchText = signal('');
  protected readonly confirmingId = signal<number | null>(null);

  protected readonly form = inject(NonNullableFormBuilder).group({
    relativeId: [0, Validators.min(1)],
    type: ['CHILD' as FamilyRelationType, Validators.required],
  });

  protected readonly relations = rxResource({
    params: () => ({ memberId: this.memberId() }),
    stream: ({ params }) => this.repository.family(params.memberId),
  });

  protected readonly candidates = rxResource({
    params: () =>
      this.addOpen() && this.searchText().trim().length >= 2
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

  protected openAdd(): void {
    this.form.reset();
    this.searchText.set('');
    this.command.clear();
    this.addOpen.set(true);
  }

  protected onSearch(text: string): void {
    this.searchText.set(text);
    this.form.controls.relativeId.setValue(0);
  }

  protected async add(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      return;
    }
    const { relativeId, type } = this.form.getRawValue();
    const done = await this.command.run(
      this.repository.addFamilyRelation(this.memberId(), { relativeId: Number(relativeId), type }),
      'Parentesco agregado.',
    );
    if (done) {
      this.addOpen.set(false);
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
