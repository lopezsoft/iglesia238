import { Permission } from '../auth/permission';
import { ROLE_PERMISSIONS, RoleCode } from '../auth/role';
import { visibleNavGroups } from './navigation';

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
