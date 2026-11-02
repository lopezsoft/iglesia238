import { DOCUMENT } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, model } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { userMessage } from '../../../../core/errors/domain-error';
import { DialogComponent } from '../../../../shared/ui/dialog.component';
import { ErrorBannerComponent, LoadingComponent } from '../../../../shared/ui/feedback.components';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { CertificatesRepository } from '../data/certificates.repository';
import { CertificateDocumentComponent } from './certificate-document.component';

/** Shows the stored snapshot of an issued certificate and prints it. */
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
          [printable]="open()"
          [label]="'Certificado ' + certificate.number"
        />
      }
      <div dialog-footer>
        <button type="button" class="btn btn--secondary" (click)="open.set(false)">Cerrar</button>
        <button
          type="button"
          class="btn btn--primary"
          [disabled]="!detail.hasValue()"
          (click)="print()"
        >
          <app-icon name="printer" />
          Imprimir
        </button>
      </div>
    </app-dialog>
  `,
})
export class CertificateViewDialogComponent {
  readonly open = model(false);
  readonly certificateId = input<number | null>(null);

  private readonly repo = inject(CertificatesRepository);
  private readonly document = inject(DOCUMENT);

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

  protected print(): void {
    this.document.defaultView?.print();
  }
}
