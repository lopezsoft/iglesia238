import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  linkedSignal,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { MemberPositionView, todayIso } from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

@Component({
  selector: 'app-positions-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    ReactiveFormsModule,
    StatusBadgeComponent,
  ],
  styleUrl: './member-tab.scss',
  templateUrl: './positions-tab.component.html',
})
export class PositionsTabComponent {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);
  private readonly fb = inject(NonNullableFormBuilder);

  readonly memberId = input.required<number>();

  protected readonly today = todayIso();
  protected readonly canWrite = computed(() => this.auth.can('members.write'));
  protected readonly command = new CommandState();
  protected readonly assignOpen = signal(false);
  protected readonly closing = signal<MemberPositionView | null>(null);
  protected readonly closeOpen = signal(false);

  protected readonly assignForm = this.fb.group({
    positionId: [0, Validators.min(1)],
    startedOn: [this.today, Validators.required],
  });
  protected readonly closeForm = this.fb.group({ endedOn: [this.today, Validators.required] });

  protected readonly view = rxResource({
    params: () => ({ memberId: this.memberId() }),
    stream: ({ params }) => this.repository.positions(params.memberId),
  });

  protected readonly data = computed(() => (this.view.hasValue() ? this.view.value() : null));
  protected readonly openPositions = computed(
    () => this.data()?.positions.filter((row) => row.endedOn === null) ?? [],
  );
  protected readonly activeCatalog = computed(
    () => this.data()?.positionCatalog.filter((row) => row.isActive) ?? [],
  );
  protected readonly activeRanks = computed(
    () => this.data()?.rankCatalog.filter((row) => row.isActive) ?? [],
  );
  protected readonly loadError = computed(() =>
    this.view.error() ? userMessage(this.view.error()) : null,
  );
  protected readonly anyDialogOpen = computed(() => this.assignOpen() || this.closeOpen());
  private readonly currentRank = computed(() => String(this.data()?.pastoralRankId ?? ''));
  /** Pastoral rank chosen in the select, reset whenever the saved one changes. */
  protected readonly rankDraft = linkedSignal(() => this.currentRank());
  protected readonly rankChanged = computed(() => this.rankDraft() !== this.currentRank());

  protected openAssign(): void {
    this.assignForm.reset();
    this.command.clear();
    this.assignOpen.set(true);
  }

  protected openClose(row: MemberPositionView): void {
    this.closing.set(row);
    this.closeForm.reset();
    this.command.clear();
    this.closeOpen.set(true);
  }

  protected async assign(): Promise<void> {
    this.assignForm.markAllAsTouched();
    if (this.assignForm.invalid) {
      return;
    }
    const { positionId, startedOn } = this.assignForm.getRawValue();
    const done = await this.command.run(
      this.repository.assignPosition(this.memberId(), {
        positionId: Number(positionId),
        startedOn,
      }),
      'Cargo asignado.',
    );
    if (done) {
      this.assignOpen.set(false);
      this.view.reload();
    }
  }

  protected async close(): Promise<void> {
    const row = this.closing();
    this.closeForm.markAllAsTouched();
    if (!row || this.closeForm.invalid) {
      return;
    }
    const done = await this.command.run(
      this.repository.closePosition(this.memberId(), row.id, this.closeForm.getRawValue().endedOn),
      `Cargo «${row.positionName}» cerrado.`,
    );
    if (done) {
      this.closeOpen.set(false);
      this.view.reload();
    }
  }

  protected async saveRank(): Promise<void> {
    if (!this.rankChanged()) {
      return;
    }
    const rankId = this.rankDraft() === '' ? null : Number(this.rankDraft());
    const done = await this.command.run(
      this.repository.setPastoralRank(this.memberId(), rankId),
      'Grado pastoral actualizado.',
    );
    if (done) {
      this.view.reload();
    }
  }
}
