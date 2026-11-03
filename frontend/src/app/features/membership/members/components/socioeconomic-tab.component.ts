import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { AuthService } from '../../../../core/auth/auth.service';
import { ROLE_NAMES } from '../../../../core/auth/role';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  ReadOnlyNoticeComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import {
  SISBEN_LEVELS,
  SOCIOECONOMIC_FLAGS,
  SocioeconomicProfile,
  SocioeconomicProfileInput,
} from '../data/members.models';
import { MembersRepository } from '../data/members.repository';
import { CommandState } from './command-state';

type Answer = '' | 'yes' | 'no';

function toAnswer(value: boolean | null): Answer {
  return value === null ? '' : value ? 'yes' : 'no';
}

function fromAnswer(answer: Answer): boolean | null {
  return answer === '' ? null : answer === 'yes';
}

/** Sensitive data: viewing needs socioeconomic-profiles.read and editing .write. */
@Component({
  selector: 'app-socioeconomic-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    DialogComponent,
    EmptyStateComponent,
    ErrorBannerComponent,
    IconComponent,
    LoadingComponent,
    ReactiveFormsModule,
    ReadOnlyNoticeComponent,
  ],
  styleUrl: './member-tab.scss',
  templateUrl: './socioeconomic-tab.component.html',
})
export class SocioeconomicTabComponent {
  private readonly repository = inject(MembersRepository);
  private readonly auth = inject(AuthService);

  readonly memberId = input.required<number>();

  protected readonly flags = SOCIOECONOMIC_FLAGS;
  protected readonly sisbenLevels = SISBEN_LEVELS;
  protected readonly canRead = computed(() => this.auth.can('socioeconomic-profiles.read'));
  protected readonly canWrite = computed(() => this.auth.can('socioeconomic-profiles.write'));
  protected readonly roleNames = computed(() =>
    this.auth
      .activeRoles()
      .map((role) => ROLE_NAMES[role])
      .join(', '),
  );

  protected readonly command = new CommandState();
  protected readonly editOpen = signal(false);

  protected readonly form = inject(NonNullableFormBuilder).group({
    hasHealthCoverage: ['' as Answer],
    isSubsidizedRegime: ['' as Answer],
    hasPension: ['' as Answer],
    hasOccupationalRiskCoverage: ['' as Answer],
    hasFamilyCompensation: ['' as Answer],
    isDisplaced: ['' as Answer],
    sisbenLevel: [''],
  });

  /** Not loaded at all without the read permission: every view is audited by the API. */
  protected readonly profile = rxResource({
    params: () => (this.canRead() ? { memberId: this.memberId() } : undefined),
    stream: ({ params }) => this.repository.socioeconomicProfile(params.memberId),
  });

  protected readonly current = computed<SocioeconomicProfile | null>(() =>
    this.profile.hasValue() ? (this.profile.value() ?? null) : null,
  );
  protected readonly loaded = computed(
    () => this.profile.hasValue() || this.profile.status() === 'resolved',
  );
  protected readonly loadError = computed(() =>
    this.profile.error() ? userMessage(this.profile.error()) : null,
  );

  protected answerLabel(value: boolean | null): string {
    return value === null ? 'Sin dato' : value ? 'Sí' : 'No';
  }

  protected openEdit(): void {
    const profile = this.current();
    this.form.reset({
      hasHealthCoverage: toAnswer(profile?.hasHealthCoverage ?? null),
      isSubsidizedRegime: toAnswer(profile?.isSubsidizedRegime ?? null),
      hasPension: toAnswer(profile?.hasPension ?? null),
      hasOccupationalRiskCoverage: toAnswer(profile?.hasOccupationalRiskCoverage ?? null),
      hasFamilyCompensation: toAnswer(profile?.hasFamilyCompensation ?? null),
      isDisplaced: toAnswer(profile?.isDisplaced ?? null),
      sisbenLevel: profile?.sisbenLevel ? String(profile.sisbenLevel) : '',
    });
    this.command.clear();
    this.editOpen.set(true);
  }

  protected async save(): Promise<void> {
    const value = this.form.getRawValue();
    const input: SocioeconomicProfileInput = {
      hasHealthCoverage: fromAnswer(value.hasHealthCoverage),
      isSubsidizedRegime: fromAnswer(value.isSubsidizedRegime),
      hasPension: fromAnswer(value.hasPension),
      hasOccupationalRiskCoverage: fromAnswer(value.hasOccupationalRiskCoverage),
      hasFamilyCompensation: fromAnswer(value.hasFamilyCompensation),
      isDisplaced: fromAnswer(value.isDisplaced),
      sisbenLevel: value.sisbenLevel === '' ? null : Number(value.sisbenLevel),
    };
    const done = await this.command.run(
      this.repository.saveSocioeconomicProfile(this.memberId(), input),
      'Ficha socioeconómica actualizada.',
    );
    if (done) {
      this.editOpen.set(false);
      this.profile.reload();
    }
  }
}
