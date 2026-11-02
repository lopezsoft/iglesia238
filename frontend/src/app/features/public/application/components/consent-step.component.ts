import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ReactiveFormsModule } from '@angular/forms';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { ConsentGroup, showsError } from '../application-form';
import { ApplicationSummary } from '../application-steps';
import { CurrentPrivacyPolicy, MAX_SUBMISSIONS_PER_SESSION } from '../data/public-application.models';

/** Step 4: data authorization (Ley 1581 de 2012) and a summary of what will be sent. */
@Component({
  selector: 'app-consent-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, DatePipe, IconComponent, LoadingComponent, ErrorBannerComponent],
  styleUrl: './consent-step.component.scss',
  templateUrl: './consent-step.component.html',
})
export class ConsentStepComponent {
  readonly group = input.required<ConsentGroup>();
  readonly policy = input<CurrentPrivacyPolicy | undefined>(undefined);
  readonly policyLoading = input(false);
  readonly policyError = input<string | null>(null);
  readonly summary = input.required<ApplicationSummary>();
  readonly revealErrors = input(false);
  readonly retryPolicy = output<void>();

  protected readonly maxSubmissions = MAX_SUBMISSIONS_PER_SESSION;

  protected consentMissing(): boolean {
    return showsError(this.group().controls.accepted, this.revealErrors());
  }
}
