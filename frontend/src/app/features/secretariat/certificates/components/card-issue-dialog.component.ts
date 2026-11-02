import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { addYears } from '../data/certificate-document';
import { CardListItem, DEFAULT_CARD_VALIDITY_YEARS } from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';

function expiryAfterIssue(group: AbstractControl): ValidationErrors | null {
  const issuedOn = group.get('issuedOn')?.value as string;
  const expiresOn = group.get('expiresOn')?.value as string;
  return issuedOn && expiresOn && expiresOn <= issuedOn ? { expiryBeforeIssue: true } : null;
}

/** A card cannot be issued in the future nor already expired on issue (YYYY-MM-DD comparison). */
function datesAroundToday(today: () => string) {
  return (group: AbstractControl): ValidationErrors | null => {
    const issuedOn = group.get('issuedOn')?.value as string;
    const expiresOn = group.get('expiresOn')?.value as string;
    // The empty form is validated on construction, before the required input is set.
    if (!issuedOn && !expiresOn) {
      return null;
    }
    const current = untracked(today);
    if (!current) {
      return null;
    }
    const errors: ValidationErrors = {
      ...(issuedOn && issuedOn > current ? { issuedInFuture: true } : {}),
      ...(expiresOn && expiresOn < current ? { expiredOnIssue: true } : {}),
    };
    return Object.keys(errors).length > 0 ? errors : null;
  };
}

/** Issues a membership card to an active member of the sede without a valid card. */
@Component({
  selector: 'app-card-issue-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    DialogComponent,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
  ],
  templateUrl: './card-issue-dialog.component.html',
})
export class CardIssueDialogComponent {
  readonly open = model(false);
  /** Today of the data source (YYYY-MM-DD): default issue date. */
  readonly today = input.required<string>();
  readonly issued = output<CardListItem>();

  private readonly repo = inject(CertificatesRepository);
  private readonly fb = inject(NonNullableFormBuilder);

  protected readonly form = this.fb.group(
    {
      memberId: this.fb.control(0, [Validators.min(1)]),
      issuedOn: this.fb.control('', [Validators.required]),
      expiresOn: this.fb.control('', [Validators.required]),
    },
    { validators: [expiryAfterIssue, datesAroundToday(() => this.today())] },
  );
  protected readonly pending = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly candidates = rxResource({
    params: () => (this.open() ? { open: true } : undefined),
    stream: () => this.repo.cardCandidates(),
  });
  protected readonly candidatesError = computed(() => userMessage(this.candidates.error()));

  private readonly memberId = toSignal(this.form.controls.memberId.valueChanges, {
    initialValue: 0,
  });
  protected readonly selected = computed(() =>
    this.candidates.hasValue()
      ? (this.candidates.value().find((candidate) => candidate.memberId === this.memberId()) ??
        null)
      : null,
  );

  constructor() {
    effect(() => {
      if (this.open()) {
        const today = untracked(() => this.today());
        this.form.reset({
          memberId: 0,
          issuedOn: today,
          expiresOn: addYears(today, DEFAULT_CARD_VALIDITY_YEARS),
        });
        this.error.set(null);
      }
    });
    // Keeps the default validity while the user has not edited the expiry.
    this.form.controls.issuedOn.valueChanges.pipe(takeUntilDestroyed()).subscribe((issuedOn) => {
      if (!this.form.controls.expiresOn.dirty && issuedOn) {
        this.form.controls.expiresOn.setValue(addYears(issuedOn, DEFAULT_CARD_VALIDITY_YEARS));
      }
    });
  }

  protected showError(control: 'memberId' | 'issuedOn' | 'expiresOn'): boolean {
    const field = this.form.controls[control];
    return field.touched && field.invalid;
  }

  protected showExpiryOrderError(): boolean {
    return this.form.controls.expiresOn.touched && this.form.hasError('expiryBeforeIssue');
  }

  protected showFutureIssueError(): boolean {
    return this.form.controls.issuedOn.touched && this.form.hasError('issuedInFuture');
  }

  protected showExpiredOnIssueError(): boolean {
    return this.form.controls.expiresOn.touched && this.form.hasError('expiredOnIssue');
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.pending.set(true);
    this.error.set(null);
    try {
      const card = await firstValueFrom(this.repo.issueCard(this.form.getRawValue()));
      this.open.set(false);
      this.issued.emit(card);
    } catch (error) {
      this.error.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
