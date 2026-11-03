import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { apiUrl } from '../http/api-url';
import { Municipality } from '../models/catalogs';
import { Catalogs, CatalogsRepository, MunicipalitySearch } from './catalogs.repository';

/** Adapter over the REST API. The browser revalidates the catalogs with the ETag of the API. */
@Injectable()
export class HttpCatalogsRepository extends CatalogsRepository {
  private readonly http = inject(HttpClient);

  catalogs(): Observable<Catalogs> {
    return this.http.get<Catalogs>(apiUrl('/catalogs'));
  }

  searchMunicipalities(query: MunicipalitySearch): Observable<readonly Municipality[]> {
    let params = new HttpParams();
    const search = query.search.trim();
    if (search) {
      params = params.set('search', search);
    }
    if (query.limit !== undefined) {
      params = params.set('limit', query.limit);
    }
    const path = query.publicAccess ? '/public/geo/municipalities' : '/geo/municipalities';
    return this.http.get<Municipality[]>(apiUrl(path), { params });
  }

  municipality(code: string): Observable<Municipality> {
    return this.http.get<Municipality>(apiUrl(`/geo/municipalities/${encodeURIComponent(code)}`));
  }
}
