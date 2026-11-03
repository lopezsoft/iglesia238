import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  ManagedUser,
  USER_STATUS_LABELS,
  USER_STATUS_TONES,
  activeAssignments,
  assignmentLabel,
  initialsOf,
} from '../data/user-roles.models';

/** Users table: name, email, active roles with scope, status and last sign-in. */
@Component({
  selector: 'app-user-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, StatusBadgeComponent],
  templateUrl: './user-table.component.html',
  styleUrl: './user-table.component.scss',
})
export class UserTableComponent {
  readonly users = input.required<readonly ManagedUser[]>();
  readonly selectedId = input<number | null>(null);
  readonly selectUser = output<number>();

  protected readonly statusLabels = USER_STATUS_LABELS;
  protected readonly statusTones = USER_STATUS_TONES;
  protected readonly initials = initialsOf;
  protected readonly label = assignmentLabel;
  protected readonly active = activeAssignments;
}
