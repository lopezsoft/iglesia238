import { HttpParams } from '@angular/common/http';

export type QueryValue = string | number | boolean | null | undefined;

/** Query string without the empty filters: the API validates what it receives. */
export function queryParams(values: Readonly<Record<string, QueryValue>>): HttpParams {
  let params = new HttpParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== '') {
      params = params.set(key, String(value));
    }
  }
  return params;
}
