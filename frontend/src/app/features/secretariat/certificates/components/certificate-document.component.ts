import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';
import { IconComponent } from '../../../../shared/ui/icon.component';
import { CertificateSnapshot } from '../data/certificates.models';

/**
 * The printed certificate (letter size): letterhead, number, body and signature lines. With
 * `printable` it becomes the only element the browser prints (see the print rules in the SCSS),
 * which is why this component is not encapsulated: every selector is prefixed with `.cert-doc`.
 */
@Component({
  selector: 'app-certificate-document',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  imports: [IconComponent],
  styleUrl: './certificate-document.component.scss',
  template: `
    <article
      class="cert-doc"
      [class.cert-doc--printable]="printable()"
      [class.cert-doc--voided]="voided()"
      [attr.aria-label]="label()"
    >
      <header class="cert-doc__head">
        <div class="cert-doc__brand">
          <span class="cert-doc__mark" aria-hidden="true"
            ><app-icon name="church" [size]="22"
          /></span>
          <div>
            <p class="cert-doc__denomination">{{ snapshot().denominationName }}</p>
            <p class="cert-doc__meta">
              Razón social: {{ snapshot().legalName }} · NIT {{ snapshot().taxId }}
            </p>
            <p class="cert-doc__meta">{{ snapshot().locationLine }}</p>
          </div>
        </div>
        <div class="cert-doc__number">
          <span>No.</span>
          <strong class="mono">{{ snapshot().number }}</strong>
        </div>
      </header>

      @if (voided()) {
        <p class="cert-doc__stamp" role="note">Anulado</p>
      }

      <div class="cert-doc__title">
        <h3>{{ snapshot().title }}</h3>
        <p>{{ snapshot().intro }}</p>
      </div>

      @if (snapshot().body) {
        <p class="cert-doc__body">{{ snapshot().body }}</p>
        @if (snapshot().donation; as donation) {
          <table class="cert-doc__table">
            <caption class="cert-doc__sr-only">
              Aportes de
              {{
                donation.fiscalYear
              }}
              por concepto
            </caption>
            <thead>
              <tr>
                <th scope="col">Concepto</th>
                <th scope="col" class="cert-doc__num">Recibos</th>
                <th scope="col" class="cert-doc__num">Valor</th>
              </tr>
            </thead>
            <tbody>
              @for (line of donation.lines; track line.concept) {
                <tr>
                  <td>{{ line.concept }}</td>
                  <td class="cert-doc__num">{{ line.receipts }}</td>
                  <td class="cert-doc__num">{{ line.amount }}</td>
                </tr>
              }
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Total</th>
                <td class="cert-doc__num">{{ donation.receipts }}</td>
                <td class="cert-doc__num">{{ donation.total }}</td>
              </tr>
            </tfoot>
          </table>
        }
        @if (snapshot().notes) {
          <p class="cert-doc__body"><strong>Observaciones:</strong> {{ snapshot().notes }}</p>
        }
        <p class="cert-doc__body">{{ snapshot().closing }}</p>
      } @else {
        <p class="cert-doc__placeholder">
          Selecciona un miembro para ver el texto del certificado.
        </p>
      }

      <div class="cert-doc__signatures">
        <div class="cert-doc__signature">
          <p>{{ snapshot().pastorName }}</p>
          <p class="cert-doc__meta">{{ snapshot().pastorTitle }}</p>
        </div>
        <div class="cert-doc__signature">
          <!-- The donations certificate leaves this line for the treasurer, who signs by hand. -->
          <p>
            {{
              snapshot().secretaryName ?? (snapshot().donation ? '' : 'Secretario(a) de la sede')
            }}
          </p>
          <p class="cert-doc__meta">{{ snapshot().secretaryTitle }}</p>
        </div>
      </div>

      <p class="cert-doc__footer">
        Verifique la autenticidad con el número del documento en la Secretaría de la sede. Emitido
        por
        {{ snapshot().issuedByName }}.
      </p>
    </article>
  `,
})
export class CertificateDocumentComponent {
  readonly snapshot = input.required<CertificateSnapshot>();
  readonly printable = input(false);
  readonly voided = input(false);
  readonly label = input('Certificado impreso');
}
