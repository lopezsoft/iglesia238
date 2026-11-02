import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { municipalityLabel } from '../../../core/models/catalogs';
import { Sex, ageOn, personFullName } from '../../../core/models/membership.model';
import { ErrorBannerComponent, EmptyStateComponent, LoadingComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { StatusCheckComponent } from '../status/components/status-check.component';
import { createApplicationForm, resetConsentWhenPolicyChanges } from './application-form';
import { APPLICATION_STEPS, ApplicationSummary, StepId } from './application-steps';
import { ApplicationStepperComponent } from './components/application-stepper.component';
import { CongregationStepComponent } from './components/congregation-step.component';
import { ConsentStepComponent } from './components/consent-step.component';
import { GuardianStepComponent } from './components/guardian-step.component';
import { PersonalDataStepComponent } from './components/personal-data-step.component';
import { SubmissionConfirmationComponent } from './components/submission-confirmation.component';
import { ADULT_AGE, ApplicationSubmission, todayIso } from './data/public-application.models';
import { PublicApplicationRepository } from './data/public-application.repository';

interface Receipt {
  readonly trackingCode: string;
  readonly congregationName: string;
}

/** C-01: public membership application in steps, with no account. */
@Component({
  selector: 'app-application-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
    EmptyStateComponent,
    ApplicationStepperComponent,
    CongregationStepComponent,
    PersonalDataStepComponent,
    GuardianStepComponent,
    ConsentStepComponent,
    SubmissionConfirmationComponent,
    StatusCheckComponent,
  ],
  templateUrl: './application.page.html',
  styleUrl: './application.page.scss',
})
export class ApplicationPage {
  private readonly repository = inject(PublicApplicationRepository);
  private readonly injector = inject(Injector);
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('applicationForm');
  private readonly confirmation = viewChild(SubmissionConfirmationComponent);

  protected readonly form = createApplicationForm(inject(NonNullableFormBuilder));

  protected readonly congregations = rxResource({
    stream: () => this.repository.listOpenCongregations(),
  });

  private readonly congregationId = toSignal(this.form.controls.congregationId.valueChanges, {
    initialValue: this.form.controls.congregationId.value,
  });
  private readonly birthDate = toSignal(this.form.controls.personal.controls.birthDate.valueChanges, {
    initialValue: this.form.controls.personal.controls.birthDate.value,
  });

  protected readonly selectedCongregation = computed(() => {
    const id = this.congregationId();
    if (id === null || !this.congregations.hasValue()) {
      return null;
    }
    return this.congregations.value().find((congregation) => congregation.id === id) ?? null;
  });

  protected readonly policy = rxResource({
    params: () => {
      const congregation = this.selectedCongregation();
      return congregation ? { denominationId: congregation.denominationId } : undefined;
    },
    stream: ({ params }) => this.repository.getCurrentPolicy(params.denominationId),
  });

  /** Age of the applicant; null while the birth date is empty or invalid. */
  protected readonly age = computed(() => {
    const birthDate = this.birthDate();
    return birthDate && this.form.controls.personal.controls.birthDate.valid
      ? ageOn(birthDate, todayIso())
      : null;
  });
  protected readonly isMinor = computed(() => {
    const age = this.age();
    return age !== null && age < ADULT_AGE;
  });

  protected readonly steps = computed(() =>
    APPLICATION_STEPS.filter((step) => step.id !== 'guardian' || this.isMinor()),
  );
  protected readonly currentStep = signal<StepId>('congregation');
  protected readonly stepIndex = computed(() =>
    Math.max(0, this.steps().findIndex((step) => step.id === this.currentStep())),
  );
  protected readonly isLastStep = computed(() => this.stepIndex() === this.steps().length - 1);

  /** Steps where the applicant pressed "Siguiente" with errors: their messages show at once. */
  protected readonly revealed = signal<ReadonlySet<StepId>>(new Set());
  protected readonly summary = signal<ApplicationSummary | null>(null);
  protected readonly pending = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly receipt = signal<Receipt | null>(null);

  protected readonly congregationsError = computed(() => userMessage(this.congregations.error()));
  protected readonly currentPolicy = computed(() =>
    this.policy.hasValue() ? this.policy.value() : undefined,
  );
  protected readonly policyError = computed(() =>
    this.policy.error() ? userMessage(this.policy.error()) : null,
  );

  constructor() {
    resetConsentWhenPolicyChanges(
      this.form.controls.consent.controls.accepted,
      computed(() => this.currentPolicy()?.id),
    );
  }

  protected next(): void {
    if (this.pending()) {
      return;
    }
    const step = this.currentStep();
    const control = this.controlOf(step);
    if (control.invalid) {
      control.markAllAsTouched();
      this.revealed.update((steps) => new Set(steps).add(step));
      this.focusFirstInvalidField();
      return;
    }
    if (this.isLastStep()) {
      void this.send();
      return;
    }
    this.goTo(this.steps()[this.stepIndex() + 1].id);
  }

  protected previous(): void {
    const index = this.stepIndex();
    if (index > 0) {
      this.goTo(this.steps()[index - 1].id);
    }
  }

  protected restart(): void {
    this.form.reset();
    this.revealed.set(new Set());
    this.summary.set(null);
    this.submitError.set(null);
    this.receipt.set(null);
    this.goTo('congregation');
  }

  private goTo(step: StepId): void {
    this.submitError.set(null);
    if (step === 'consent') {
      this.summary.set(this.buildSummary());
    }
    this.currentStep.set(step);
    // Move focus to the step title so keyboard and screen reader users start at the top.
    afterNextRender(() => this.stepHeading()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusFirstInvalidField(): void {
    afterNextRender(
      () =>
        this.formElement()
          ?.nativeElement.querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid')
          ?.focus(),
      { injector: this.injector },
    );
  }

  private controlOf(step: StepId): AbstractControl {
    switch (step) {
      case 'congregation':
        return this.form.controls.congregationId;
      case 'personal':
        return this.form.controls.personal;
      case 'guardian':
        return this.form.controls.guardian;
      case 'consent':
        return this.form.controls.consent;
    }
  }

  private async send(): Promise<void> {
    const congregation = this.selectedCongregation();
    const policy = this.policy.hasValue() ? this.policy.value() : undefined;
    const sex = this.form.controls.personal.controls.sex.value;
    if (!congregation || !policy || sex === '') {
      return;
    }
    this.pending.set(true);
    this.submitError.set(null);
    try {
      const { trackingCode } = await firstValueFrom(this.repository.submit(this.buildSubmission(policy.id, sex)));
      this.receipt.set({ trackingCode, congregationName: congregation.name });
      // The form (and its focused submit button) is replaced by the confirmation: move focus to it.
      afterNextRender(() => this.confirmation()?.focus(), { injector: this.injector });
    } catch (error) {
      this.submitError.set(userMessage(error));
      if (error instanceof DomainError && error.code === 'POLICY_OUTDATED') {
        this.form.controls.consent.controls.accepted.reset(false);
        this.policy.reload();
      }
    } finally {
      this.pending.set(false);
    }
  }

  private buildSubmission(policyId: number, sex: Sex): ApplicationSubmission {
    const { congregationId, personal, guardian, consent } = this.form.getRawValue();
    return {
      congregationId: congregationId ?? 0,
      policyId,
      firstName: personal.firstName.trim(),
      lastName: personal.lastName.trim(),
      secondLastName: personal.secondLastName.trim() || null,
      documentTypeCode: personal.documentTypeCode,
      documentNumber: personal.documentNumber.trim(),
      birthDate: personal.birthDate,
      sex,
      maritalStatusCode: personal.maritalStatusCode,
      phone: personal.phone.trim(),
      email: personal.email.trim() || null,
      address: personal.address.trim(),
      municipalityCode: personal.municipalityCode,
      guardian: this.isMinor()
        ? {
            name: guardian.name.trim(),
            document: guardian.document.trim(),
            relationship: guardian.relationship,
            phone: guardian.phone.trim(),
          }
        : null,
      consentAccepted: consent.accepted,
      website: consent.website,
    };
  }

  private buildSummary(): ApplicationSummary {
    const { personal, guardian } = this.form.getRawValue();
    return {
      congregationName: this.selectedCongregation()?.name ?? '—',
      applicantName: personFullName({
        firstName: personal.firstName.trim(),
        lastName: personal.lastName.trim(),
        secondLastName: personal.secondLastName.trim() || null,
      }),
      document: `${personal.documentTypeCode} ${personal.documentNumber.trim()}`,
      birthDate: personal.birthDate,
      municipality: municipalityLabel(personal.municipalityCode),
      phone: personal.phone.trim(),
      email: personal.email.trim() || null,
      guardian: this.isMinor() ? `${guardian.name.trim()} (${guardian.relationship})` : null,
    };
  }
}
