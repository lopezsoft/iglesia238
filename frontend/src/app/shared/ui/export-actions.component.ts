import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { IconComponent } from './icon.component';

export type ExportFormat = 'pdf' | 'xlsx' | 'csv';

const FORMAT_LABELS: Readonly<Record<ExportFormat, string>> = { pdf: 'PDF', xlsx: 'Excel', csv: 'CSV' };

/**
 * "DESCARGAR  PDF  Excel" pill. It only emits the chosen format: the page decides whether the
 * export exists (offer only formats the API provides) and performs the download.
 */
@Component({
  selector: 'app-export-actions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [IconComponent],
  styleUrl: './export-actions.component.scss',
  template: `
    <div class="export" role="group" aria-label="Descargar">
      <span class="export__caption"><app-icon name="download" [size]="12" />Descargar</span>
      @for (format of formats(); track format) {
        <button
          type="button"
          class="btn btn--sm btn--ghost"
          [class.btn--export-pdf]="format === 'pdf'"
          [class.btn--export-xls]="format === 'xlsx'"
          [disabled]="disabled()"
          [attr.aria-label]="'Descargar en ' + labelOf(format)"
          (click)="requested.emit(format)"
        >
          <app-icon [name]="format === 'pdf' ? 'file-text' : 'table'" [size]="14" />
          {{ labelOf(format) }}
        </button>
      }
    </div>
  `,
})
export class ExportActionsComponent {
  readonly formats = input<readonly ExportFormat[]>(['pdf', 'xlsx']);
  readonly disabled = input(false);
  /** Emits the chosen format; bind it as `(export)="..."`. */
  readonly requested = output<ExportFormat>({ alias: 'export' });

  protected labelOf(format: ExportFormat): string {
    return FORMAT_LABELS[format];
  }
}
