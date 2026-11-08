/** A certificate type with the texts the denomination customized (null: the default text is printed). */
export interface CertificateTypeTemplate {
  readonly id: number;
  readonly code: string;
  readonly name: string;
  readonly validityDays: number | null;
  readonly template: string | null;
  readonly introTemplate: string | null;
  readonly closingTemplate: string | null;
  readonly pastorTitleTemplate: string | null;
  readonly secretaryTitleTemplate: string | null;
}

export interface TemplatePlaceholder {
  readonly key: string;
  readonly description: string;
}

/** What the editor needs: the types, the placeholders it may offer and the text printed by default. */
export interface TemplateCatalog {
  readonly types: readonly CertificateTypeTemplate[];
  readonly placeholders: readonly TemplatePlaceholder[];
  readonly defaults: {
    readonly intro: string;
    readonly closing: string;
    readonly pastorTitle: string;
    readonly secretaryTitle: string;
  };
}

/** The editable part of a type. A blank text goes back to the default; null validity means "does not expire". */
export interface CertificateTypeChanges {
  readonly name: string;
  readonly validityDays: number | null;
  readonly template: string;
  readonly introTemplate: string;
  readonly closingTemplate: string;
  readonly pastorTitleTemplate: string;
  readonly secretaryTitleTemplate: string;
}

/** A sample certificate rendered with the texts being edited (fictitious data; nothing is saved). */
export interface TemplatePreview {
  readonly title: string;
  readonly intro: string;
  readonly body: string;
  readonly closing: string;
  readonly pastorName: string;
  readonly pastorTitle: string;
  readonly secretaryName: string;
  readonly secretaryTitle: string;
}
