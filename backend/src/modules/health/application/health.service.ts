import { Inject, Injectable } from '@nestjs/common';
import { SmartLogger } from '../../../common/logging/smart-logger.service.js';
import { HEALTH_INDICATORS, HealthIndicator } from './health-indicator.port.js';

const DEPENDENCY_TIMEOUT_MS = 2000;

export type DependencyStatus = 'up' | 'down';

export interface ReadinessReport {
  isReady: boolean;
  checks: Record<string, DependencyStatus>;
}

@Injectable()
export class HealthService {
  constructor(
    @Inject(HEALTH_INDICATORS)
    private readonly indicators: readonly HealthIndicator[],
    private readonly logger: SmartLogger,
  ) {}

  async getReadiness(): Promise<ReadinessReport> {
    const entries = await Promise.all(
      this.indicators.map(
        async (indicator) =>
          [indicator.name, await this.probe(indicator)] as const,
      ),
    );

    return {
      isReady: entries.every(([, status]) => status === 'up'),
      checks: Object.fromEntries(entries),
    };
  }

  private async probe(indicator: HealthIndicator): Promise<DependencyStatus> {
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('Health check timed out')),
        DEPENDENCY_TIMEOUT_MS,
      );
    });

    try {
      await Promise.race([indicator.check(), timeout]);
      return 'up';
    } catch (error) {
      this.logger.warn(
        `${indicator.name} is unavailable: ${String(error)}`,
        HealthService.name,
      );
      return 'down';
    } finally {
      clearTimeout(timer);
    }
  }
}
