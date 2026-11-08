/** The visual identity of a denomination as the repository stores it. */
export interface BrandingRecord {
  readonly denominationId: number;
  readonly denominationName: string;
  /** Key of the logo in the file storage (branding/<id>/logo-<hash>.png), or null. */
  readonly logoKey: string | null;
  /** #RRGGBB in lowercase, or null for the default color of the system. */
  readonly primaryColor: string | null;
}

/** What may change: a field that is missing stays as it is, null clears it. */
export interface BrandingChanges {
  readonly logoKey?: string | null;
  readonly primaryColor?: string | null;
}

export interface BrandingView {
  readonly denominationName: string;
  /** The web app builds the URL of the logo from this key: `/api/public/<logoKey>`. */
  readonly logoKey: string | null;
  readonly primaryColor: string | null;
  /** What the documents use while the denomination has not chosen a color. */
  readonly defaultColor: string;
  readonly limits: {
    readonly logoMaxBytes: number;
    readonly logoMinDimension: number;
    readonly logoMaxDimension: number;
    readonly minContrast: number;
  };
}

/** A logo file as the public route serves it. */
export interface LogoFile {
  readonly content: Buffer;
  readonly mimeType: 'image/png' | 'image/jpeg';
}
