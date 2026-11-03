import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  model,
  signal,
} from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { FileDownloadService } from '../../../../shared/utils/file-download.service';
import { CertificatesRepository } from '../data/certificates.repository';
import { CertificateDocumentComponent } from './certificate-document.component';

/** Shows the stored snapshot of an issued certificate and downloads the PDF the server draws. */
@Component({
  selector: 'app-certificate-view-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    DialogComponent,
    IconComponent,
    LoadingComponent,
    ErrorBannerComponent,
    CertificateDocumentComponent,
  ],
  template: `
    <app-dialog [(open)]="open" [title]="title()" variant="wide">
      @if (detail.isLoading()) {
        <app-loading label="Cargando certificado…" />
      } @else if (detail.error()) {
        <app-error-banner [message]="errorMessage()" (retry)="detail.reload()" />
      } @else if (detail.value(); as certificate) {
        @if (certificate.status === 'VOIDED') {
          <div class="alert alert--danger" role="note">
            <app-icon name="ban" />
            <span>Certificado anulado. Motivo: {{ certificate.voidReason }}</span>
          </div>
        }
        <app-certificate-document
          [snapshot]="certificate.snapshot"
          [voided]="certificate.status === 'VOIDED'"
          [label]="'Certificado ' + certificate.number"
        />
      }
      @if (downloadError(); as message) {
        <div class="alert alert--danger" role="alert">
          <app-icon name="alert" />
          <span>{{ message }}</span>
        </div>
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cerrar</button>
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="!detail.hasValue() || downloading()"
          (click)="download()"
        >
          <app-icon name="file-text" />
          {{ downloading() ? 'Generando PDF…' : 'Descargar PDF' }}
        </button>
      </div>
    </app-dialog>
  `,
})
export class CertificateViewDialogComponent {
  readonly open = model(false);
  readonly certificateId = input<number | null>(null);

  private readonly repo = inject(CertificatesRepository);
  private readonly files = inject(FileDownloadService);

  protected readonly downloading = signal(false);
  protected readonly downloadError = signal<string | null>(null);

  protected readonly detail = rxResource({
    params: () => {
      const id = this.certificateId();
      return this.open() && id !== null ? { id } : undefined;
    },
    stream: ({ params }) => this.repo.getCertificate(params.id),
  });

  protected readonly title = computed(() => {
    // value() throws while the resource is in error state.
    const certificate = this.detail.hasValue() ? this.detail.value() : null;
    return certificate ? `${certificate.typeName} ${certificate.number}` : 'Certificado';
  });
  protected readonly errorMessage = computed(() => userMessage(this.detail.error()));

  protected async download(): Promise<void> {
    if (!this.detail.hasValue()) {
      return;
    }
    const { id, number } = this.detail.value();
    this.downloading.set(true);
    this.downloadError.set(null);
    try {
      this.files.save(await firstValueFrom(this.repo.certificatePdf(id)), `${number}.pdf`);
    } catch (error) {
      this.downloadError.set(userMessage(error));
    } finally {
      this.downloading.set(false);
    }
  }
}
