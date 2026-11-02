import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  linkedSignal,
  output,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { APPLICATION_STATUS_LABELS } from '../../../../core/models/membership.model';
import {
  DOCUMENT_TYPES,
  MARITAL_STATUSES,
  catalogName,
  municipalityLabel,
} from '../../../../core/models/catalogs';
import { ReadOnlyNoticeComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  APPLICATION_STATUS_TONES,
  ApplicationDetail,
  SEX_LABELS,
  documentLabel,
  isReviewable,
} from '../data/applications.models';
import { DuplicateWarningComponent } from './duplicate-warning.component';
import { RejectFormComponent } from './reject-form.component';

/** Detail of one application with its review actions. Commands are run by the page. */
@Component({
  selector: 'app-application-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    RouterLink,
    IconComponent,
    StatusBadgeComponent,
    ReadOnlyNoticeComponent,
    DuplicateWarningComponent,
    RejectFormComponent,
  ],
  templateUrl: './application-detail.component.html',
  styleUrl: './application-detail.component.scss',
})
export class ApplicationDetailComponent {
  readonly application = input.required<ApplicationDetail>();
  readonly canReview = input(false);
  readonly pending = input(false);
  /**
   * The reviewer said the person with the same document is someone else (this review only): the
   * application's document is wrong, so it can only be rejected.
   */
  readonly duplicateDismissed = input(false);
  readonly reviewerName = input('');

  readonly startReview = output<void>();
  readonly reject = output<string>();
  readonly markDuplicate = output<number>();
  readonly dismissDuplicate = output<void>();
  readonly approve = output<void>();

  protected readonly statusLabels = APPLICATION_STATUS_LABELS;
  protected readonly statusTones = APPLICATION_STATUS_TONES;

  /** Closes the reject form whenever another application is shown. */
  protected readonly rejectOpen = linkedSignal({
    source: () => this.application().id,
    computation: () => false,
  });

  protected readonly reviewable = computed(() => isReviewable(this.application().status));
  protected readonly document = computed(() =>
    documentLabel(this.application().documentTypeCode, this.application().documentNumber),
  );
  protected readonly documentTypeName = computed(() =>
    catalogName(DOCUMENT_TYPES, this.application().documentTypeCode),
  );
  protected readonly sex = computed(() => {
    const sex = this.application().formData.sex;
    return sex ? SEX_LABELS[sex] : '—';
  });
  protected readonly maritalStatus = computed(() =>
    catalogName(MARITAL_STATUSES, this.application().formData.maritalStatusCode),
  );
  protected readonly municipality = computed(() =>
    municipalityLabel(this.application().formData.municipalityCode),
  );
  protected readonly showDuplicateWarning = computed(
    () =>
      this.reviewable() && this.application().duplicateMatch !== null && !this.duplicateDismissed(),
  );
  protected readonly showDismissedMatch = computed(
    () =>
      this.reviewable() && this.application().duplicateMatch !== null && this.duplicateDismissed(),
  );
  /** A person with the same document always blocks approval, even after a dismissal. */
  protected readonly approveBlocked = computed(
    () => this.reviewable() && this.application().duplicateMatch !== null,
  );
}
