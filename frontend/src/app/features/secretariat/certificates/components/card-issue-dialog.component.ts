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
import { rxResource, takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  AbstractControl,
  NonNullableFormBuilder,
  ReactiveFormsModule,
  ValidationErrors,
  Validators,
} from '@angular/forms';
import { firstValueFrom, switchMap, timer } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { addYears } from '../data/certificate-document';
import {
  CardCandidate,
  CardListItem,
  DEFAULT_CARD_VALIDITY_YEARS,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';

const CANDIDATE_PAGE_SIZE = 8;
const SEARCH_DEBOUNCE_MS = 250;

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

/** Issues a membership card to an active, registered member of the sede without a valid card. */
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
  styleUrl: './card-issue-dialog.component.scss',
})
export class CardIssueDialogComponent {
  readonly open = model(false);
  /** Today of the server (YYYY-MM-DD): default issue date. */
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

  protected readonly search = signal('');
  protected readonly selected = signal<CardCandidate | null>(null);

  /** The first page of candidates, narrowed by what the person types (the server searches). */
  protected readonly candidates = rxResource({
    params: () => (this.open() ? { q: this.search().trim() || null } : undefined),
    stream: ({ params }) =>
      timer(params.q === null ? 0 : SEARCH_DEBOUNCE_MS).pipe(
        switchMap(() =>
          this.repo.cardCandidates({ q: params.q, page: 1, pageSize: CANDIDATE_PAGE_SIZE }),
        ),
      ),
  });
  protected readonly candidatesError = computed(() => userMessage(this.candidates.error()));
  protected readonly noCandidatesAtAll = computed(
    () =>
      this.candidates.hasValue() &&
      this.candidates.value().total === 0 &&
      this.search().trim() === '',
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
        this.selected.set(null);
        this.search.set('');
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

  protected pick(candidate: CardCandidate): void {
    this.selected.set(candidate);
    this.form.controls.memberId.setValue(candidate.memberId);
    this.form.controls.memberId.markAsTouched();
  }

  protected clearPick(): void {
    this.selected.set(null);
    this.form.controls.memberId.setValue(0);
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
