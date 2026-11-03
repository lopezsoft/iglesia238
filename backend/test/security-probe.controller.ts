import { Controller, Get, Module } from '@nestjs/common';
import { CurrentTenant } from '../src/common/security/current-user.decorators.js';
import {
  RequireAnyPermission,
  RequirePermissions,
} from '../src/common/security/permissions.decorator.js';
import { Public } from '../src/common/security/public.decorator.js';
import { TenantContext } from '../src/common/tenancy/tenant-context.js';

/** Test-only routes that exercise the global guards. */
@Controller('test-security')
class SecurityProbeController {
  @Public()
  @Get('public')
  publicRoute() {
    return { ok: true };
  }

  /** Authentication only: no permissions declared. */
  @Get('open')
  open() {
    return { ok: true };
  }

  @RequirePermissions('members.read')
  @Get('members')
  members(@CurrentTenant() tenant: TenantContext) {
    return {
      scopeKey: tenant.scopeKey,
      denominationId: tenant.denominationId,
      congregationId: tenant.congregationId,
    };
  }

  @RequirePermissions('members.read', 'members.write')
  @Get('members-write')
  membersWrite() {
    return { ok: true };
  }

  @RequireAnyPermission('reports.read', 'contributions.read')
  @Get('reports')
  reports() {
    return { ok: true };
  }
}

@Module({ controllers: [SecurityProbeController] })
export class SecurityProbeModule {}
