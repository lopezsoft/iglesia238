import { HttpHeaders, HttpParams, HttpResponse } from '@angular/common/http';

type QueryValue = string | number | boolean | null | undefined;

/** Query string without the empty filters: the API validates what it receives. */
export function toParams(values: Readonly<Record<string, QueryValue>>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}

/** A file the API generated (CSV), ready to hand to the browser. */
export interface ExportedFile {
  readonly blob: Blob;
  readonly filename: string;
}

const FILENAME = /filename="?([^";]+)"?/i;

/** Name proposed by the API in Content-Disposition, or the fallback when the header is missing. */
export function filenameOf(headers: HttpHeaders, fallback: string): string {
  const match = FILENAME.exec(headers.get('Content-Disposition') ?? '');
  return match ? match[1] : fallback;
}

export function toExportedFile(response: HttpResponse<Blob>, fallback: string): ExportedFile {
  return {
    blob: response.body ?? new Blob([], { type: 'text/csv;charset=utf-8' }),
    filename: filenameOf(response.headers, fallback),
  };
}
