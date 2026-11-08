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
import { rxResource, toObservable, toSignal } from '@angular/core/rxjs-interop';
import { debounceTime, firstValueFrom } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { userMessage } from '../../../../core/errors/domain-error';
import { ExportActionsComponent } from '../../../../shared/ui/export-actions.component';
import {
  EmptyStateComponent,
  ErrorBannerComponent,
  LoadingComponent,
  PaginationComponent,
} from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { StatusBadgeComponent } from '../../../../shared/ui/status-badge.component';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import {
  CERTIFICATE_STATUS_LABELS,
  CertificateListItem,
  CertificateSort,
  CertificateStatus,
  CertificateTypeSummary,
} from '../data/certificates.models';
import { CertificatesRepository } from '../data/certificates.repository';
import { CertificateViewDialogComponent } from './certificate-view-dialog.component';
import { VoidDialogComponent } from './void-dialog.component';

const PAGE_SIZE = 10;
const SEARCH_DEBOUNCE_MS = 300;

/** Issued certificates of the scope: filters, server pagination, view, PDF, CSV export and void. */
@Component({
  selector: 'app-certificates-table',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DatePipe,
    IconComponent,
    StatusBadgeComponent,
    ExportActionsComponent,
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
  readonly types = input<readonly Pick<CertificateTypeSummary, 'code' | 'name'>[]>([]);
  /** Changes when the parent issues a certificate, so the list reloads. */
  readonly reloadKey = input(0);
  readonly voided = output<CertificateListItem>();

  private readonly repo = inject(CertificatesRepository);
  private readonly auth = inject(AuthService);
  private readonly files = inject(FileDownloadService);

  protected readonly statusLabels = CERTIFICATE_STATUS_LABELS;
  protected readonly hasSede = computed(() => this.auth.tenant().congregationId !== null);
  protected readonly canIssue = computed(
    () =>
      (this.auth.can('certificates.issue') || this.auth.can('donation-certificates.issue')) &&
      this.hasSede(),
  );
  protected readonly typeFilter = signal<string | null>(null);
  protected readonly statusFilter = signal<CertificateStatus | null>(null);
  protected readonly search = signal('');
  protected readonly issuedFrom = signal<string | null>(null);
  protected readonly issuedTo = signal<string | null>(null);
  protected readonly sort = signal<CertificateSort>('issuedOn:desc');
  protected readonly page = signal(1);

  /** The list asks the server only after the person stops typing. */
  private readonly query = toSignal(
    toObservable(this.search).pipe(debounceTime(SEARCH_DEBOUNCE_MS)),
    { initialValue: '' },
  );

  protected readonly certificates = rxResource({
    params: () => ({
      typeCode: this.typeFilter(),
      status: this.statusFilter(),
      q: this.query().trim() || null,
      issuedFrom: this.issuedFrom(),
      issuedTo: this.issuedTo(),
      sort: this.sort(),
      page: this.page(),
      pageSize: PAGE_SIZE,
      tenant: this.auth.tenant(),
      reloadKey: this.reloadKey(),
    }),
    stream: ({ params }) => this.repo.listCertificates(params),
  });
  /** `value()` throws while a resource is in error, so everything else reads this. */
  protected readonly certificatesData = computed(() =>
    this.certificates.hasValue() ? this.certificates.value() : undefined,
  );
  protected readonly loadError = computed(() => userMessage(this.certificates.error()));
  protected readonly hasFilters = computed(
    () =>
      this.typeFilter() !== null ||
      this.statusFilter() !== null ||
      this.search().trim() !== '' ||
      this.issuedFrom() !== null ||
      this.issuedTo() !== null,
  );

  protected readonly viewOpen = signal(false);
  protected readonly viewId = signal<number | null>(null);

  protected readonly voidOpen = signal(false);
  protected readonly voidTarget = signal<CertificateListItem | null>(null);
  protected readonly voidPending = signal(false);
  protected readonly voidError = signal<string | null>(null);
  protected readonly message = signal<string | null>(null);
  protected readonly downloadError = signal<string | null>(null);
  protected readonly downloadingId = signal<number | 'export' | null>(null);

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

  protected onSearch(value: string): void {
    this.search.set(value);
    this.page.set(1);
  }

  protected onDate(which: 'from' | 'to', value: string): void {
    (which === 'from' ? this.issuedFrom : this.issuedTo).set(value === '' ? null : value);
    this.page.set(1);
  }

  protected toggleSort(): void {
    this.sort.update((current) => (current === 'issuedOn:desc' ? 'issuedOn:asc' : 'issuedOn:desc'));
    this.page.set(1);
  }

  protected clearFilters(): void {
    this.typeFilter.set(null);
    this.statusFilter.set(null);
    this.search.set('');
    this.issuedFrom.set(null);
    this.issuedTo.set(null);
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

  protected async downloadPdf(certificate: CertificateListItem): Promise<void> {
    this.downloadError.set(null);
    this.downloadingId.set(certificate.id);
    try {
      this.files.save(
        await firstValueFrom(this.repo.certificatePdf(certificate.id)),
        `${certificate.number}.pdf`,
      );
    } catch (error) {
      this.downloadError.set(userMessage(error));
    } finally {
      this.downloadingId.set(null);
    }
  }

  protected async exportCsv(): Promise<void> {
    this.downloadError.set(null);
    this.downloadingId.set('export');
    try {
      const blob = await firstValueFrom(
        this.repo.exportCertificates({
          typeCode: this.typeFilter(),
          status: this.statusFilter(),
          q: this.search().trim() || null,
          issuedFrom: this.issuedFrom(),
          issuedTo: this.issuedTo(),
          sort: this.sort(),
        }),
      );
      this.files.save(blob, 'certificados.csv');
    } catch (error) {
      this.downloadError.set(userMessage(error));
    } finally {
      this.downloadingId.set(null);
    }
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
