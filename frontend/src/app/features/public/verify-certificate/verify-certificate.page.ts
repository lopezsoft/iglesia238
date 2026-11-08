import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { userMessage } from '../../../core/errors/domain-error';
import { IconComponent } from '../../../shared/ui/icon.component';
import { BadgeTone, StatusBadgeComponent } from '../../../shared/ui/status-badge.component';
import {
  CertificateVerification,
  CertificateVerificationStatus,
} from './data/certificate-verification.models';
import { CertificateVerificationRepository } from './data/certificate-verification.repository';

const VERDICTS: Readonly<
  Record<
    CertificateVerificationStatus,
    { readonly label: string; readonly tone: BadgeTone; readonly detail: string }
  >
> = {
  VALID: {
    label: 'Documento auténtico y vigente',
    tone: 'success',
    detail: 'Este documento fue expedido por la iglesia indicada y se encuentra vigente.',
  },
  EXPIRED: {
    label: 'Documento auténtico, pero vencido',
    tone: 'warning',
    detail: 'Este documento fue expedido por la iglesia indicada, pero su vigencia ya terminó.',
  },
  VOIDED: {
    label: 'Documento anulado',
    tone: 'danger',
    detail: 'Este documento fue anulado por la iglesia que lo expidió y ya no tiene validez.',
  },
};

/** Public page opened by the QR code of a certificate: confirms it is authentic and shows its state. */
@Component({
  selector: 'app-verify-certificate-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe, IconComponent, StatusBadgeComponent],
  styles: `
    @use 'tokens' as *;

    .verify {
      display: flex;
      flex-direction: column;
      gap: $space-5;
      max-width: 36rem;
      margin: 0 auto;
    }

    .verify__intro {
      display: flex;
      flex-direction: column;
      gap: $space-1;
    }

    .verify__facts {
      display: grid;
      gap: $space-3;
      margin: 0;
    }

    .verify__facts dt {
      color: var(--color-text-muted);
      font-size: 0.8125rem;
    }

    .verify__facts dd {
      margin: 0;
      font-weight: 600;
    }

    .verify__header {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: $space-2;
    }
  `,
  template: `
    <div class="verify">
      <header class="verify__intro">
        <p class="text-muted text-small">Verificación pública · Sin cuenta</p>
        <h1>Verificar la autenticidad de un documento</h1>
      </header>
      <section class="card" aria-live="polite" aria-label="Resultado de la verificación">
        @if (pending()) {
          <p class="text-muted">Verificando…</p>
        } @else if (errorMessage(); as message) {
          <p class="alert alert--danger" role="alert">{{ message }}</p>
        } @else if (result(); as found) {
          <div class="verify__header">
            <span class="chip chip--mono">{{ found.number }}</span>
            <app-status-badge
              [label]="verdicts[found.status].label"
              [tone]="verdicts[found.status].tone"
            />
          </div>
          <p>{{ verdicts[found.status].detail }}</p>
          <dl class="verify__facts">
            <div>
              <dt>Documento</dt>
              <dd>{{ found.title }}</dd>
            </div>
            <div>
              <dt>Titular</dt>
              <dd>{{ found.holderName }}</dd>
            </div>
            <div>
              <dt>Expedido por</dt>
              <dd>{{ found.denominationName }} · {{ found.congregationName }}</dd>
            </div>
            <div>
              <dt>Fecha de expedición</dt>
              <dd>{{ found.issuedOn | date: 'dd/MM/yyyy' }}</dd>
            </div>
            @if (found.expiresOn) {
              <div>
                <dt>Válido hasta</dt>
                <dd>{{ found.expiresOn | date: 'dd/MM/yyyy' }}</dd>
              </div>
            }
          </dl>
          <p class="text-small text-muted">
            <app-icon name="lock" [size]="14" />
            Por privacidad solo mostramos el nombre abreviado del titular. Compáralo con el
            documento impreso.
          </p>
        }
      </section>
    </div>
  `,
})
export class VerifyCertificatePage implements OnInit {
  private readonly repository = inject(CertificateVerificationRepository);
  private readonly route = inject(ActivatedRoute);

  protected readonly verdicts = VERDICTS;
  protected readonly pending = signal(true);
  protected readonly result = signal<CertificateVerification | null>(null);
  protected readonly errorMessage = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('t')?.trim() ?? '';
    if (token === '') {
      this.errorMessage.set(
        'El enlace está incompleto. Escanea de nuevo el código QR del documento.',
      );
      this.pending.set(false);
      return;
    }
    try {
      this.result.set(await firstValueFrom(this.repository.verify(token)));
    } catch (error) {
      this.errorMessage.set(userMessage(error));
    } finally {
      this.pending.set(false);
    }
  }
}
