import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, linkedSignal } from '@angular/core';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { AuditEntryView, auditActionLabel, auditActionTone, auditEntityLabel } from '../data/audit-log.models';

/** Audit events with an expandable field diff per row. */
@Component({
  selector: 'app-audit-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, StatusBadgeComponent],
  templateUrl: './audit-table.component.html',
  styleUrl: './audit-table.component.scss',
})
export class AuditTableComponent {
  readonly entries = input.required<readonly AuditEntryView[]>();
  readonly page = input.required<number>();

  protected readonly actionLabel = auditActionLabel;
  protected readonly actionTone = auditActionTone;
  protected readonly entityLabel = auditEntityLabel;
  /** Collapses the open diff whenever another page or filter loads. */
  protected readonly expandedId = linkedSignal<readonly AuditEntryView[], number | null>({
    source: () => this.entries(),
    computation: () => null,
  });

  protected toggle(entryId: number): void {
    this.expandedId.update((current) => (current === entryId ? null : entryId));
  }
}
