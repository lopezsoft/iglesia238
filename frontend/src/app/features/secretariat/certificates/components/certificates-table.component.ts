import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import {
  CERTIFICATE_STATUS_LABELS,
  CertificateListItem,
  CertificateStatus,
  CertificateTypeOption,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CertificateViewDialogComponent } from './certificate-view-dialog.component';
import { VoidDialogComponent } from './void-dialog.component';

const PAGE_SIZE = 10;

/** Issued certificates of the scope, with view/print and void. */
@Component({
  selector: 'app-certificates-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IconComponent,
    StatusBadgeComponent,
    LoadingComponent,
    ErrorBannerComponent,
    EmptyStateComponent,
    PaginationComponent,
    CertificateViewDialogComponent,
    VoidDialogComponent,
  ],
  templateUrl: './certificates-table.component.html',
  styleUrl: './certificates-table.component.scss',
})
export class CertificatesTableComponent {
  /** Certificate types of the denomination, for the filter. */
  readonly types = input<readonly Pick<CertificateTypeOption, 'code' | 'name'>[]>([]);
  /** Changes when the parent issues a certificate, so the list reloads. */
  readonly reloadKey = input(0);
  readonly voided = output<CertificateListItem>();

  private readonly repo = inject(CertificatesRepository);
  private readonly auth = inject(AuthService);

  protected readonly statusLabels = CERTIFICATE_STATUS_LABELS;
  protected readonly canIssue = computed(
    () => this.auth.can('certificates.issue') && this.auth.tenant().congregationId !== null,
  );
  protected readonly typeFilter = signal<string | null>(null);
  protected readonly statusFilter = signal<CertificateStatus | null>(null);
  protected readonly page = signal(1);

  protected readonly certificates = rxResource({
    params: () => ({
      typeCode: this.typeFilter(),
      status: this.statusFilter(),
      page: this.page(),
      pageSize: PAGE_SIZE,
      tenant: this.auth.tenant(),
      reloadKey: this.reloadKey(),
    }),
    stream: ({ params }) => this.repo.listCertificates(params),
  });
  protected readonly loadError = computed(() => userMessage(this.certificates.error()));

  protected readonly viewOpen = signal(false);
  protected readonly viewId = signal<number | null>(null);

  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<CertificateListItem | null>(null);
  protected readonly voidPending = signal(false);
  protected readonly voidError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);

  protected readonly voidSubject = computed(() => {
    const target = this.voidTarget();
    return target ? `${target.number} · ${target.typeName} · ${target.memberName}` : '';
  });

  protected onTypeFilter(value: string): void {
    this.typeFilter.set(value === '' ? null : value);
    this.page.set(1);
  }

  protected onStatusFilter(value: string): void {
    this.statusFilter.set(value === 'ISSUED' || value === 'VOIDED' ? value : null);
    this.page.set(1);
  }

  protected view(certificate: CertificateListItem): void {
    this.viewId.set(certificate.id);
    this.viewOpen.set(true);
  }

  protected askVoid(certificate: CertificateListItem): void {
    this.voidTarget.set(certificate);
    this.voidError.set(null);
    this.voidOpen.set(true);
  }

  protected async confirmVoid(reason: string): Promise<void> {
    const target = this.voidTarget();
    if (!target) {
      return;
    }
    this.voidPending.set(true);
    this.voidError.set(null);
    try {
      const voided = await firstValueFrom(this.repo.voidCertificate({ id: target.id, reason }));
      this.voidOpen.set(false);
      this.message.set(`${voided.number} quedó anulado. El número sigue registrado con el motivo.`);
      this.certificates.reload();
      this.voided.emit(voided);
    } catch (error) {
      this.voidError.set(userMessage(error));
    } finally {
      this.voidPending.set(false);
    }
  }

  protected badgeTone(status: CertificateStatus): 'success' | 'danger' {
    return status === 'ISSUED' ? 'success' : 'danger';
  }
}
