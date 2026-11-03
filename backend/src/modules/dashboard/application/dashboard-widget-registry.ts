import { Injectable } from '@nestjs/common';
import { DiscoveryService } from '@nestjs/core';
import type { DashboardWidgetProvider } from './dashboard.types.js';

/**
 * Marks a provider class as a source of dashboard widgets. The class must be a provider of any module
 * and implement DashboardWidgetProvider; the dashboard finds it without that module being imported.
 *
 *   @Injectable()
 *   @RegisterDashboardWidgets()
 *   export class MembershipWidgets implements DashboardWidgetProvider { ... }
 */
export const RegisterDashboardWidgets =
  DiscoveryService.createDecorator<void>();

function isWidgetProvider(value: unknown): value is DashboardWidgetProvider {
  const candidate = value as Partial<DashboardWidgetProvider> | null;
  return (
    typeof candidate?.key === 'string' &&
    typeof candidate.provide === 'function' &&
    Array.isArray(candidate.requiredPermissions) &&
    Array.isArray(candidate.scopeKinds)
  );
}

/** Finds the providers of every module once (they do not change while the app runs). */
@Injectable()
export class DashboardWidgetRegistry {
  private cached: readonly DashboardWidgetProvider[] | null = null;

  constructor(private readonly discovery: DiscoveryService) {}

  all(): readonly DashboardWidgetProvider[] {
    this.cached ??= this.discovery
      .getProviders({ metadataKey: RegisterDashboardWidgets.KEY })
      .map((wrapper) => wrapper.instance as unknown)
      .filter(isWidgetProvider);
    return this.cached;
  }
}
