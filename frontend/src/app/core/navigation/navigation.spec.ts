import { Permission } from '../auth/permission';
import { RoleCode } from '../auth/role';
import { ROLE_PERMISSIONS } from '../auth/testing/role-permissions';
import { NAV_GROUPS, visibleNavGroups, visibleQuickActions } from './navigation';

function menuFor(role: RoleCode): string[] {
  const granted = new Set<Permission>(ROLE_PERMISSIONS[role]);
  const canAny = (permissions: readonly Permission[]) =>
    permissions.length === 0 || permissions.some((permission) => granted.has(permission));
  return visibleNavGroups(canAny).flatMap((group) => group.items.map((item) => item.label));
}

describe('visibleNavGroups', () => {
  it('shows the platform admin only platform modules', () => {
    expect(menuFor('PLATFORM_ADMIN')).toEqual(['Inicio', 'Denominaciones', 'Usuarios y roles', 'Auditoría']);
  });

  it('shows the treasurer the accounting modules but no membership data', () => {
    const menu = menuFor('TREASURER');
    expect(menu).toContain('Libro de caja');
    expect(menu).toContain('Configuración contable');
    expect(menu).not.toContain('Miembros');
    expect(menu).not.toContain('Solicitudes');
  });

  it('shows the pastor read access to contributions but not the cash book', () => {
    const menu = menuFor('PASTOR');
    expect(menu).toContain('Aportes');
    expect(menu).toContain('Votos');
    expect(menu).not.toContain('Libro de caja');
    expect(menu).not.toContain('Asistencia');
  });

  it('drops groups that end up empty', () => {
    const groups = visibleNavGroups((permissions) => permissions.length === 0);
    expect(groups.map((group) => group.label)).toEqual(['General']);
  });
});

describe('NAV_GROUPS', () => {
  it('gives every item a short label that fits the icon rail', () => {
    const items = NAV_GROUPS.flatMap((group) => group.items);
    expect(items.length).toBeGreaterThan(0);
    for (const item of items) {
      expect(item.shortLabel.length, item.label).toBeGreaterThan(0);
      expect(item.shortLabel.length, item.label).toBeLessThanOrEqual(12);
    }
  });

  it('has one route per item', () => {
    const paths = NAV_GROUPS.flatMap((group) => group.items.map((item) => item.path));
    expect(new Set(paths).size).toBe(paths.length);
  });
});

describe('visibleQuickActions', () => {
  it('offers the treasurer money actions and not membership ones', () => {
    const granted = new Set<Permission>(ROLE_PERMISSIONS.TREASURER);
    const canAny = (permissions: readonly Permission[]) => permissions.some((p) => granted.has(p));
    const labels = visibleQuickActions(canAny).map((action) => action.label);

    expect(labels).toContain('Registrar aporte');
    expect(labels).toContain('Registrar movimiento de caja');
    expect(labels).not.toContain('Nuevo miembro');
  });

  it('offers the platform admin only platform actions', () => {
    const granted = new Set<Permission>(ROLE_PERMISSIONS.PLATFORM_ADMIN);
    const canAny = (permissions: readonly Permission[]) => permissions.some((p) => granted.has(p));

    expect(visibleQuickActions(canAny).map((action) => action.label)).toEqual(['Invitar usuario', 'Nueva denominación']);
  });
});
