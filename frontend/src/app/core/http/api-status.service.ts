import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { apiUrl } from './api-url';

export type ApiStatus = 'checking' | 'online' | 'offline';

/** Reachability of the API (GET /api/health), shown by the status icon of the top bar. */
@Injectable({ providedIn: 'root' })
export class ApiStatusService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<ApiStatus>('checking');

  readonly status = this.state.asReadonly();

  async check(): Promise<void> {
    try {
      await firstValueFrom(this.http.get(apiUrl('/health')));
      this.state.set('online');
    } catch {
      this.state.set('offline');
    }
  }
}
