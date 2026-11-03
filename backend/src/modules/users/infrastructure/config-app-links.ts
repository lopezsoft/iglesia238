import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Environment } from '../../../config/environment.js';
import type { AppLinks } from '../application/users.ports.js';

/** Builds the links of the web app (the pages that accept an invitation or reset a password). */
@Injectable()
export class ConfigAppLinks implements AppLinks {
  private readonly baseUrl: string;

  constructor(config: ConfigService<Environment, true>) {
    this.baseUrl = config
      .get('APP_BASE_URL', { infer: true })
      .replace(/\/+$/, '');
  }

  invitation(token: string): string {
    return `${this.baseUrl}/login/accept-invitation?token=${encodeURIComponent(token)}`;
  }

  passwordReset(token: string): string {
    return `${this.baseUrl}/login/reset-password?token=${encodeURIComponent(token)}`;
  }
}
