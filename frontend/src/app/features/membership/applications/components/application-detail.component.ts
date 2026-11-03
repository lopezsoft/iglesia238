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
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ReadOnlyNoticeComponent } from '../../../../shared/ui/feedback.components';
import { IconChipComponent } from '../../../../shared/ui/icon-chip.component';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { MiniStatComponent } from '../../../../shared/ui/mini-stat.component';
import { SectionPanelComponent } from '../../../../shared/ui/section-panel.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  APPLICATION_STATUS_TONES,
  ApplicationDetail,
  PersonMatch,
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
    IconChipComponent,
    MiniStatComponent,
    SectionPanelComponent,
    StatusBadgeComponent,
    DialogComponent,
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
  /** Approve on top of the existing person that holds the document. */
  readonly approveLinked = output<number>();

  protected readonly statusLabels = APPLICATION_STATUS_LABELS;
  protected readonly statusTones = APPLICATION_STATUS_TONES;

  /** Closes the reject form and the link confirmation whenever another application is shown. */
  protected readonly rejectOpen = linkedSignal({
    source: () => this.application().id,
    computation: () => false,
  });
  protected readonly linkCandidate = linkedSignal<number, PersonMatch | null>({
    source: () => this.application().id,
    computation: () => null,
  });
  protected readonly linkDialogOpen = linkedSignal({
    source: () => this.application().id,
    computation: () => false,
  });

  protected readonly reviewable = computed(() => isReviewable(this.application().status));
  protected readonly document = computed(() =>
    documentLabel(this.application().documentTypeCode, this.application().documentNumber),
  );
  protected readonly sex = computed(() => SEX_LABELS[this.application().formData.sex]);
  protected readonly municipality = computed(() => {
    const { municipalityName, regionName } = this.application().formData;
    return municipalityName ? [municipalityName, regionName].filter(Boolean).join(', ') : '—';
  });
  protected readonly baptism = computed(() => {
    const flag = this.application().formData.isBaptized;
    return flag === null ? 'No indicó' : flag ? 'Sí' : 'No';
  });
  protected readonly showDuplicateWarning = computed(
    () =>
      this.reviewable() && this.application().duplicateMatch !== null && !this.duplicateDismissed(),
  );
  protected readonly showDismissedMatch = computed(
    () =>
      this.reviewable() && this.application().duplicateMatch !== null && this.duplicateDismissed(),
  );
  /** A person with the same document always blocks a plain approval, even after a dismissal. */
  protected readonly approveBlocked = computed(
    () => this.reviewable() && this.application().duplicateMatch !== null,
  );

  protected askToLink(personId: number): void {
    const match = this.application().duplicateMatch;
    if (match && match.personId === personId) {
      this.linkCandidate.set(match);
      this.linkDialogOpen.set(true);
    }
  }

  protected confirmLink(): void {
    const candidate = this.linkCandidate();
    this.linkDialogOpen.set(false);
    if (candidate) {
      this.approveLinked.emit(candidate.personId);
    }
  }
}
