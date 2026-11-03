import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { rxResource, takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { AbstractControl, NonNullableFormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom, pairwise, startWith } from 'rxjs';
import { DomainError, userMessage } from '../../../core/errors/domain-error';
import { ErrorBannerComponent, LoadingComponent } from '../../../shared/ui/feedback.components';
import { IconComponent } from '../../../shared/ui/icon.component';
import { SpinnerComponent } from '../../../shared/ui/spinner.component';
import { TextFieldComponent } from '../../../shared/ui/text-field.component';
import { PASSWORD_HINT, newPasswordError } from '../../auth/password-form';
import { ApplicationStepperComponent } from '../application/components/application-stepper.component';
import { MunicipalityPickerComponent } from '../application/components/municipality-picker.component';
import { LegalEntityPickerComponent } from './components/legal-entity-picker.component';
import { RegistrationDoneComponent } from './components/registration-done.component';
import { createRegistrationForm } from './congregation-registration-form';
import { REGISTRATION_STEPS, RegistrationStepId } from './congregation-registration-steps';
import { REGISTRATION_LIMITS, CongregationRegistration } from './data/congregation-registration.models';
import { CongregationRegistrationRepository } from './data/congregation-registration.repository';

/** 400 of the API when the municipality is not of the country of the legal entity. */
const MUNICIPALITY_COUNTRY_MISMATCH = 'MUNICIPALITY_COUNTRY_MISMATCH';
/** Key of the control error that carries a message of the API for the municipality. */
const API_ERROR = 'api';

interface Receipt {
  readonly congregationName: string;
  readonly managerEmail: string;
  readonly devVerificationLink: string | null;
}

/** Messages of the validators of each field; the first failing one is shown. */
type Messages = Readonly<Record<string, string>>;

const MESSAGES = {
  name: { required: 'Escribe el nombre de la sede.', maxlength: 'El nombre admite máximo 150 caracteres.' },
  address: { required: 'Escribe la dirección de la sede.', maxlength: 'La dirección admite máximo 200 caracteres.' },
  phone: { pattern: 'Escribe un teléfono válido (7 a 20 dígitos).', maxlength: 'El teléfono admite máximo 30 caracteres.' },
  email: { email: 'Escribe un correo válido.', maxlength: 'El correo admite máximo 191 caracteres.' },
  displayName: { required: 'Escribe tu nombre completo.', maxlength: 'El nombre admite máximo 150 caracteres.' },
  managerEmail: {
    required: 'Escribe tu correo: ahí te enviaremos el enlace de confirmación.',
    email: 'Escribe un correo válido.',
    maxlength: 'El correo admite máximo 191 caracteres.',
  },
  confirm: { required: 'Repite la contraseña.' },
} as const satisfies Record<string, Messages>;

/** Public registration of a congregation (sede) with its manager's user: no account, no approval. */
@Component({
  selector: 'app-congregation-registration-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ApplicationStepperComponent,
    ErrorBannerComponent,
    IconComponent,
    LegalEntityPickerComponent,
    LoadingComponent,
    MunicipalityPickerComponent,
    RegistrationDoneComponent,
    SpinnerComponent,
    TextFieldComponent,
  ],
  templateUrl: './congregation-registration.page.html',
  styleUrl: './congregation-registration.page.scss',
})
export class CongregationRegistrationPage {
  private readonly repository = inject(CongregationRegistrationRepository);
  private readonly injector = inject(Injector);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formElement = viewChild<ElementRef<HTMLFormElement>>('registrationForm');
  private readonly stepHeading = viewChild<ElementRef<HTMLElement>>('stepHeading');
  private readonly done = viewChild(RegistrationDoneComponent);

  protected readonly form = createRegistrationForm(inject(NonNullableFormBuilder));
  protected readonly limits = REGISTRATION_LIMITS;
  protected readonly passwordHint = PASSWORD_HINT;
  protected readonly steps = REGISTRATION_STEPS;
  protected readonly stepIndex = signal(0);
  protected readonly currentStep = computed<RegistrationStepId>(() => this.steps[this.stepIndex()].id);
  protected readonly isLastStep = computed(() => this.stepIndex() === this.steps.length - 1);

  protected readonly legalEntities = rxResource({ stream: () => this.repository.listLegalEntities() });
  protected readonly legalEntitiesError = computed(() => userMessage(this.legalEntities.error()));
  /** The platform has not registered any legal entity yet: the form is not offered at all. */
  protected readonly noEntities = computed(
    () => this.legalEntities.hasValue() && this.legalEntities.value().length === 0,
  );
  private readonly chosenEntityId = toSignal(this.form.controls.legalEntityId.valueChanges, { initialValue: null });
  protected readonly selectedEntity = computed(() =>
    this.legalEntities.hasValue()
      ? (this.legalEntities.value().find((entity) => entity.id === this.chosenEntityId()) ?? null)
      : null,
  );

  /** False when the country of the chosen legal entity has no municipality loaded. */
  protected readonly municipalitiesAvailable = signal(true);

  /** The person pressed "Siguiente" or "Registrar": every error of the current step shows at once. */
  protected readonly revealed = signal(false);
  protected readonly pending = signal(false);
  protected readonly submitError = signal<string | null>(null);
  protected readonly receipt = signal<Receipt | null>(null);

  protected fieldError(control: AbstractControl, messages: Messages): string | null {
    if (control.valid || !(control.touched || this.revealed())) {
      return null;
    }
    const key = Object.keys(control.errors ?? {}).find((error) => error in messages);
    return key ? messages[key] : null;
  }

  protected readonly nameError = () => this.fieldError(this.form.controls.congregation.controls.name, MESSAGES.name);
  protected readonly addressError = () =>
    this.fieldError(this.form.controls.congregation.controls.address, MESSAGES.address);
  protected readonly phoneError = () => this.fieldError(this.form.controls.congregation.controls.phone, MESSAGES.phone);
  protected readonly emailError = () => this.fieldError(this.form.controls.congregation.controls.email, MESSAGES.email);
  protected readonly displayNameError = () =>
    this.fieldError(this.form.controls.manager.controls.displayName, MESSAGES.displayName);
  protected readonly managerEmailError = () =>
    this.fieldError(this.form.controls.manager.controls.email, MESSAGES.managerEmail);

  constructor() {
    // The municipality must be of the country of the legal entity: choosing an entity of another country
    // (after going back to step 1) forgets the municipality picked for the previous one.
    this.form.controls.legalEntityId.valueChanges
      .pipe(startWith(this.form.controls.legalEntityId.value), pairwise(), takeUntilDestroyed(this.destroyRef))
      .subscribe(([previous, next]) => {
        if (previous !== null && this.countryOf(previous) !== this.countryOf(next)) {
          const congregation = this.form.controls.congregation.controls;
          congregation.municipalityCode.reset('');
          congregation.municipalityName.reset('');
        }
      });
  }

  protected municipalityInvalid(): boolean {
    const control = this.form.controls.congregation.controls.municipalityCode;
    return !this.municipalitiesAvailable() || (control.invalid && (control.touched || this.revealed()));
  }

  /** Why the municipality is not valid: the API's message, a country without municipalities, or empty. */
  protected municipalityError(): string {
    const control = this.form.controls.congregation.controls.municipalityCode;
    const apiMessage = control.getError(API_ERROR) as string | null;
    if (apiMessage) {
      return apiMessage;
    }
    if (!this.municipalitiesAvailable()) {
      return 'El país de esta razón social aún no tiene municipios cargados, así que la sede no se puede registrar todavía. Pide al administrador de la plataforma que los cargue.';
    }
    return 'Selecciona el municipio.';
  }

  /** Ids of the hint and the error the municipality search is described by. */
  protected municipalityDescribedBy(): string {
    const ids = this.selectedEntity() ? ['register-municipality-country'] : [];
    if (this.municipalityInvalid()) {
      ids.push('register-municipality-error');
    }
    return ids.join(' ');
  }

  private countryOf(legalEntityId: number | null): number | null {
    if (legalEntityId === null || !this.legalEntities.hasValue()) {
      return null;
    }
    return this.legalEntities.value().find((entity) => entity.id === legalEntityId)?.countryId ?? null;
  }

  protected passwordError(): string | null {
    return newPasswordError(this.form.controls.manager.controls.password);
  }

  protected confirmError(): string | null {
    const manager = this.form.controls.manager;
    const control = manager.controls.confirm;
    if (!(control.touched || this.revealed())) {
      return null;
    }
    if (control.hasError('required')) {
      return MESSAGES.confirm.required;
    }
    return manager.hasError('mismatch') ? 'Las contraseñas no coinciden.' : null;
  }

  protected previous(): void {
    if (this.pending() || this.stepIndex() === 0) {
      return;
    }
    this.submitError.set(null);
    this.revealed.set(false);
    this.stepIndex.update((index) => index - 1);
    this.focusStepHeading();
  }

  /** Validates the current step and moves on; on the last step it sends the registration. */
  protected async next(): Promise<void> {
    if (this.pending()) {
      return;
    }
    this.submitError.set(null);
    const control = this.currentStepControl();
    if (control.invalid) {
      control.markAllAsTouched();
      this.revealed.set(true);
      this.focusFirstInvalidField();
      return;
    }
    this.revealed.set(false);
    if (!this.isLastStep()) {
      this.stepIndex.update((index) => index + 1);
      this.focusStepHeading();
      return;
    }
    await this.register();
  }

  private currentStepControl(): AbstractControl {
    switch (this.currentStep()) {
      case 'church':
        return this.form.controls.legalEntityId;
      case 'congregation':
        return this.form.controls.congregation;
      case 'manager':
        return this.form.controls.manager;
    }
  }

  private async register(): Promise<void> {
    this.pending.set(true);
    try {
      const body = this.buildRegistration();
      const result = await firstValueFrom(this.repository.register(body));
      this.receipt.set({
        congregationName: result.congregationName,
        managerEmail: body.manager.email,
        devVerificationLink: result.devVerificationLink,
      });
      // The form (and its focused submit button) is replaced by the confirmation: move focus to it.
      afterNextRender(() => this.done()?.focus(), { injector: this.injector });
    } catch (error) {
      if (error instanceof DomainError && error.code === MUNICIPALITY_COUNTRY_MISMATCH) {
        this.showMunicipalityError(error.message);
      } else {
        this.submitError.set(userMessage(error));
      }
    } finally {
      this.pending.set(false);
    }
  }

  /** Takes the person back to the sede step with the message of the API on the municipality field. */
  private showMunicipalityError(message: string): void {
    const control = this.form.controls.congregation.controls.municipalityCode;
    // The error goes away by itself as soon as another municipality is picked (validators run again).
    control.setErrors({ [API_ERROR]: message });
    control.markAsTouched();
    this.stepIndex.set(this.steps.findIndex((step) => step.id === 'congregation'));
    this.revealed.set(true);
    this.focusFirstInvalidField();
  }

  private focusStepHeading(): void {
    afterNextRender(() => this.stepHeading()?.nativeElement.focus(), { injector: this.injector });
  }

  private focusFirstInvalidField(): void {
    afterNextRender(
      () =>
        this.formElement()
          ?.nativeElement.querySelector<HTMLElement>('input[type="radio"].ng-invalid, [aria-invalid="true"]')
          ?.focus(),
      { injector: this.injector },
    );
  }

  private buildRegistration(): CongregationRegistration {
    const { legalEntityId, congregation, manager } = this.form.getRawValue();
    const optional = (value: string): string | undefined => value.trim() || undefined;
    return {
      legalEntityId: legalEntityId ?? 0,
      congregation: {
        name: congregation.name.trim(),
        municipalityCode: congregation.municipalityCode.trim(),
        address: optional(congregation.address),
        phone: optional(congregation.phone),
        email: optional(congregation.email),
      },
      manager: {
        displayName: manager.displayName.trim(),
        email: manager.email.trim(),
        password: manager.password,
      },
    };
  }
}
