import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { catchError, debounceTime, filter, firstValueFrom, map, of, switchMap } from 'rxjs';
import { userMessage } from '../../../core/errors/domain-error';
import {
  CertificateTypeChanges,
  CertificateTypeTemplate,
  TemplateCatalog,
  TemplatePreview,
} from './data/certificate-templates.models';
import { CertificateTemplatesRepository } from './data/certificate-templates.repository';

type TextField =
  | 'template'
  | 'introTemplate'
  | 'closingTemplate'
  | 'pastorTitleTemplate'
  | 'secretaryTitleTemplate';

interface TextFieldConfig {
  readonly control: TextField;
  readonly label: string;
  readonly rows: number;
  readonly maxLength: number;
  /** Key of `TemplateCatalog.defaults` printed when this field is left blank (the body has none: it depends on the type). */
  readonly defaultKey: keyof TemplateCatalog['defaults'] | null;
}

const TEXT_FIELDS: readonly TextFieldConfig[] = [
  { control: 'introTemplate', label: 'Encabezado', rows: 2, maxLength: 500, defaultKey: 'intro' },
  { control: 'template', label: 'Cuerpo', rows: 5, maxLength: 2000, defaultKey: null },
  { control: 'closingTemplate', label: 'Cierre', rows: 2, maxLength: 500, defaultKey: 'closing' },
  {
    control: 'pastorTitleTemplate',
    label: 'Título bajo la firma del pastor',
    rows: 1,
    maxLength: 120,
    defaultKey: 'pastorTitle',
  },
  {
    control: 'secretaryTitleTemplate',
    label: 'Título bajo la firma de la secretaría',
    rows: 1,
    maxLength: 120,
    defaultKey: 'secretaryTitle',
  },
];

/** D-01: the denomination edits the texts its certificates print. Certificates already issued do not change. */
@Component({
  selector: 'app-certificate-templates-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  styles: `
    @use 'tokens' as *;

    .templates {
      display: grid;
      gap: $space-5;
      grid-template-columns: minmax(0, 1fr);
    }

    @media (min-width: 64rem) {
      .templates {
        grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
        align-items: start;
      }
    }

    .templates__types {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
    }

    .templates__form {
      display: flex;
      flex-direction: column;
      gap: $space-4;
    }

    .templates__placeholders {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
    }

    .templates__actions {
      display: flex;
      flex-wrap: wrap;
      gap: $space-2;
      align-items: center;
    }

    .templates__sheet {
      display: flex;
      flex-direction: column;
      gap: $space-3;
      font-family: Georgia, 'Times New Roman', serif;
    }

    .templates__sheet-title {
      text-align: center;
      letter-spacing: 0.06em;
      font-weight: 700;
    }

    .templates__sheet-body {
      white-space: pre-line;
      text-align: justify;
    }

    .templates__signatures {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: $space-4;
      margin-top: $space-4;
      text-align: center;
      font-size: 0.8125rem;
    }
  `,
  template: `
    <div class="page">
      <header class="page__header">
        <h1>Plantillas de certificados</h1>
        <p class="text-muted">
          Personaliza los textos que imprimen los certificados de tu denominación. Los certificados
          ya expedidos no cambian: conservan el texto con el que se imprimieron.
        </p>
      </header>

      @if (loading()) {
        <p class="text-muted" aria-live="polite">Cargando…</p>
      } @else if (loadError(); as message) {
        <p class="alert alert--danger" role="alert">{{ message }}</p>
      } @else if (catalog(); as data) {
        <div class="templates__types" role="tablist" aria-label="Tipo de certificado">
          @for (type of data.types; track type.id) {
            <button
              type="button"
              role="tab"
              class="btn btn--sm"
              [class.btn--primary]="type.id === selectedId()"
              [class.btn--secondary]="type.id !== selectedId()"
              [attr.aria-selected]="type.id === selectedId()"
              (click)="select(type)"
            >
              {{ type.name }}
            </button>
          }
        </div>

        <div class="templates">
          <form class="card templates__form" [formGroup]="form" (ngSubmit)="save()" novalidate>
            <div class="field">
              <label for="type-name">Nombre del tipo *</label>
              <input
                id="type-name"
                class="input"
                type="text"
                formControlName="name"
                maxlength="100"
              />
              @if (form.controls.name.touched && form.controls.name.invalid) {
                <span class="field__error">Escribe un nombre de entre 3 y 100 caracteres.</span>
              }
            </div>
            <div class="field">
              <label for="type-validity">Vigencia en días</label>
              <input
                id="type-validity"
                class="input"
                type="number"
                min="1"
                max="3650"
                formControlName="validityDays"
                aria-describedby="validity-help"
              />
              <span id="validity-help" class="field__hint"
                >Déjala vacía si el certificado no vence.</span
              >
            </div>

            @for (field of textFields; track field.control) {
              <div class="field">
                <label [for]="'text-' + field.control">{{ field.label }}</label>
                <textarea
                  [id]="'text-' + field.control"
                  class="textarea"
                  [rows]="field.rows"
                  [attr.maxlength]="field.maxLength"
                  [formControlName]="field.control"
                  [attr.aria-describedby]="'help-' + field.control"
                  (focus)="focused.set(field.control)"
                ></textarea>
                <span [id]="'help-' + field.control" class="field__hint">
                  @if (field.defaultKey; as key) {
                    En blanco se imprime: «{{ data.defaults[key] }}».
                  } @else {
                    En blanco se imprime el texto estándar del tipo.
                  }
                </span>
              </div>
            }

            <div class="field">
              <span class="field__label" id="placeholders-label">
                Marcadores (se insertan al final del campo seleccionado)
              </span>
              <div
                class="templates__placeholders"
                role="group"
                aria-labelledby="placeholders-label"
              >
                @for (placeholder of data.placeholders; track placeholder.key) {
                  <button
                    type="button"
                    class="btn btn--ghost btn--sm"
                    [title]="placeholder.description"
                    (click)="insert(placeholder.key)"
                  >
                    {{ '{{' + placeholder.key + '}}' }}
                  </button>
                }
              </div>
            </div>

            @if (saveError(); as message) {
              <p class="alert alert--danger" role="alert">{{ message }}</p>
            }
            @if (saved()) {
              <p class="alert alert--success" role="status">
                Cambios guardados. Se usarán en los próximos certificados.
              </p>
            }
            <div class="templates__actions">
              <button type="submit" class="btn btn--primary" [disabled]="saving() || form.invalid">
                Guardar cambios
              </button>
              <button
                type="button"
                class="btn btn--secondary"
                [disabled]="saving()"
                (click)="restore()"
              >
                Descartar cambios
              </button>
            </div>
          </form>

          <section class="card" aria-live="polite" aria-label="Vista previa">
            <h2>Vista previa</h2>
            <p class="text-small text-muted">
              Con datos de ejemplo. Se actualiza mientras escribes.
            </p>
            @if (previewError(); as message) {
              <p class="alert alert--danger" role="alert">{{ message }}</p>
            } @else if (preview(); as sheet) {
              <div class="templates__sheet">
                <p class="templates__sheet-title">{{ sheet.title }}</p>
                <p>{{ sheet.intro }}</p>
                <p class="templates__sheet-body">{{ sheet.body }}</p>
                <p>{{ sheet.closing }}</p>
                <div class="templates__signatures">
                  <div>
                    <strong>{{ sheet.pastorName }}</strong>
                    <div>{{ sheet.pastorTitle }}</div>
                  </div>
                  <div>
                    <strong>{{ sheet.secretaryName }}</strong>
                    <div>{{ sheet.secretaryTitle }}</div>
                  </div>
                </div>
              </div>
            } @else {
              <p class="text-muted">Cargando vista previa…</p>
            }
          </section>
        </div>
      }
    </div>
  `,
})
export class CertificateTemplatesPage implements OnInit {
  private readonly repository = inject(CertificateTemplatesRepository);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly textFields = TEXT_FIELDS;
  protected readonly loading = signal(true);
  protected readonly loadError = signal<string | null>(null);
  protected readonly catalog = signal<TemplateCatalog | null>(null);
  protected readonly selectedId = signal<number | null>(null);
  protected readonly focused = signal<TextField>('template');
  protected readonly saving = signal(false);
  protected readonly saved = signal(false);
  protected readonly saveError = signal<string | null>(null);
  protected readonly preview = signal<TemplatePreview | null>(null);
  protected readonly previewError = signal<string | null>(null);
  protected readonly selectedType = computed(
    () => this.catalog()?.types.find((type) => type.id === this.selectedId()) ?? null,
  );

  protected readonly form = inject(NonNullableFormBuilder).group({
    name: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
    validityDays: [null as number | null, [Validators.min(1), Validators.max(3650)]],
    template: [''],
    introTemplate: [''],
    closingTemplate: [''],
    pastorTitleTemplate: [''],
    secretaryTitleTemplate: [''],
  });

  constructor() {
    // The preview follows the form: one request per pause in the typing, the latest one wins.
    this.form.valueChanges
      .pipe(
        map(() => this.selectedId()),
        filter((id): id is number => id !== null),
        debounceTime(500),
        switchMap((id) =>
          this.repository.preview(id, this.changes()).pipe(
            map((sheet) => ({ sheet, error: null as string | null })),
            catchError((error: unknown) => of({ sheet: null, error: userMessage(error) })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ sheet, error }) => {
        this.saved.set(false);
        this.preview.set(sheet ?? this.preview());
        this.previewError.set(error);
      });
  }

  async ngOnInit(): Promise<void> {
    try {
      const catalog = await firstValueFrom(this.repository.catalog());
      this.catalog.set(catalog);
      if (catalog.types.length > 0) {
        this.select(catalog.types[0]);
      }
    } catch (error) {
      this.loadError.set(userMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

  protected select(type: CertificateTypeTemplate): void {
    this.selectedId.set(type.id);
    this.fill(type);
    this.saved.set(false);
    this.saveError.set(null);
    void this.refreshPreview(type.id);
  }

  protected restore(): void {
    const type = this.selectedType();
    if (type) {
      this.fill(type);
      this.saveError.set(null);
    }
  }

  /** Appends a placeholder to the text field the person was in. */
  protected insert(key: string): void {
    const control = this.form.controls[this.focused()];
    control.setValue(`${control.value}{{${key}}}`);
    control.markAsDirty();
  }

  protected async save(): Promise<void> {
    const id = this.selectedId();
    if (id === null || this.saving()) {
      return;
    }
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saveError.set(null);
    try {
      const updated = await firstValueFrom(this.repository.save(id, this.changes()));
      this.catalog.update((data) =>
        data
          ? { ...data, types: data.types.map((type) => (type.id === updated.id ? updated : type)) }
          : data,
      );
      this.fill(updated);
      this.saved.set(true);
    } catch (error) {
      this.saveError.set(userMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  private fill(type: CertificateTypeTemplate): void {
    this.form.reset(
      {
        name: type.name,
        validityDays: type.validityDays,
        template: type.template ?? '',
        introTemplate: type.introTemplate ?? '',
        closingTemplate: type.closingTemplate ?? '',
        pastorTitleTemplate: type.pastorTitleTemplate ?? '',
        secretaryTitleTemplate: type.secretaryTitleTemplate ?? '',
      },
      { emitEvent: false },
    );
  }

  private changes(): CertificateTypeChanges {
    const value = this.form.getRawValue();
    return {
      ...value,
      // An emptied number field arrives as null or '': both mean "does not expire".
      validityDays: typeof value.validityDays === 'number' ? value.validityDays : null,
    };
  }

  private async refreshPreview(typeId: number): Promise<void> {
    try {
      this.preview.set(await firstValueFrom(this.repository.preview(typeId, this.changes())));
      this.previewError.set(null);
    } catch (error) {
      this.previewError.set(userMessage(error));
    }
  }
}
