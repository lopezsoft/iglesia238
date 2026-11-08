/** The logo and the color of the denomination, with the limits the server enforces. */
export interface Branding {
  readonly denominationName: string;
  /** Key of the logo in the storage; its URL is `brandingFileUrl(logoKey)`. Null: no logo. */
  readonly logoKey: string | null;
  /** #RRGGBB, or null for the default color of the system. */
  readonly primaryColor: string | null;
  /** What the documents use while no color is chosen. */
  readonly defaultColor: string;
  readonly limits: {
    readonly logoMaxBytes: number;
    readonly logoMinDimension: number;
    readonly logoMaxDimension: number;
    /** Minimum WCAG contrast of the color against white. */
    readonly minContrast: number;
  };
}
