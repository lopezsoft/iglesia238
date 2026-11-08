import { buildTenantContext } from '../../../../../test/support/tenants.js';
import {
  InvalidInputException,
  NotFoundDomainException,
} from '../../../../common/errors/domain.exception.js';
import type { SmartLogger } from '../../../../common/logging/smart-logger.service.js';
import type { TenantContext } from '../../../../common/tenancy/tenant-context.js';
import type { AiTool } from './ai-tool.js';
import { AiToolCatalog, MAX_TOOL_OUTPUT_CHARS } from './ai-tool-catalog.js';

function tool(
  name: string,
  permission: string,
  run: AiTool['run'] = () => Promise.resolve({ ok: true }),
): AiTool {
  return {
    name,
    title: `Título de ${name}`,
    description: `Descripción de ${name}`,
    inputSchema: { type: 'object', properties: {} },
    permission,
    run,
  };
}

function build(tools: AiTool[]) {
  const error = vi.fn();
  const catalog = new AiToolCatalog(tools, { error } as unknown as SmartLogger);
  return { catalog, error };
}

const withPermissions = (...permissions: string[]): TenantContext =>
  buildTenantContext({ permissions });

describe('AiToolCatalog', () => {
  const tools = [
    tool('finanzas', 'reports.read'),
    tool('asistencia', 'attendance.write'),
    tool('miembros', 'members.read'),
  ];

  it('offers each person only the tools of the screens they can open', () => {
    const { catalog } = build(tools);

    expect(
      catalog.availableTo(withPermissions('reports.read')).map((t) => t.name),
    ).toEqual(['finanzas']);
    expect(
      catalog
        .availableTo(withPermissions('reports.read', 'members.read'))
        .map((t) => t.name),
    ).toEqual(['finanzas', 'miembros']);
    expect(catalog.availableTo(withPermissions())).toEqual([]);
  });

  it('describes them to the model with name, description and schema', () => {
    const { catalog } = build(tools);

    expect(catalog.specsFor(withPermissions('reports.read'))).toEqual([
      {
        name: 'finanzas',
        description: 'Descripción de finanzas',
        inputSchema: { type: 'object', properties: {} },
      },
    ]);
  });

  it('lists the permissions of every tool, without repeating them', () => {
    const { catalog } = build([...tools, tool('otra', 'reports.read')]);

    expect(catalog.allPermissions()).toEqual([
      'reports.read',
      'attendance.write',
      'members.read',
    ]);
  });

  it('knows the title of a tool, and falls back to its name', () => {
    const { catalog } = build(tools);

    expect(catalog.titleOf('finanzas')).toBe('Título de finanzas');
    expect(catalog.titleOf('desconocida')).toBe('desconocida');
  });

  it('runs a tool with the context of who asked and the arguments it sent, and answers JSON', async () => {
    const run = vi.fn().mockResolvedValue({ total: 1_500 });
    const { catalog } = build([tool('finanzas', 'reports.read', run)]);
    const tenant = withPermissions('reports.read');

    const outcome = await catalog.execute(tenant, 'finanzas', {
      desde: '2026-01-01',
    });

    expect(run).toHaveBeenCalledWith(tenant, { desde: '2026-01-01' });
    expect(outcome).toEqual({ content: '{"total":1500}', isError: false });
  });

  it('runs a tool without arguments', async () => {
    const run = vi.fn().mockResolvedValue({});
    const { catalog } = build([tool('finanzas', 'reports.read', run)]);

    await catalog.execute(
      withPermissions('reports.read'),
      'finanzas',
      undefined,
    );

    expect(run).toHaveBeenCalledWith(expect.anything(), {});
  });

  it('refuses a tool the person cannot use, as if it did not exist, and does not run it', async () => {
    const run = vi.fn();
    const { catalog } = build([tool('finanzas', 'reports.read', run)]);

    const outcome = await catalog.execute(
      withPermissions('members.read'),
      'finanzas',
      {},
    );

    expect(outcome.isError).toBe(true);
    expect(outcome.content).toContain('no existe o no está disponible');
    expect(run).not.toHaveBeenCalled();
  });

  it('refuses a tool that does not exist', async () => {
    const { catalog } = build(tools);

    const outcome = await catalog.execute(
      withPermissions('reports.read'),
      'borrar_todo',
      {},
    );

    expect(outcome.isError).toBe(true);
  });

  it.each([['texto'], [42], [['lista']], [true]])(
    'refuses arguments that are not an object: %j',
    async (input) => {
      const run = vi.fn();
      const { catalog } = build([tool('finanzas', 'reports.read', run)]);

      const outcome = await catalog.execute(
        withPermissions('reports.read'),
        'finanzas',
        input,
      );

      expect(outcome.isError).toBe(true);
      expect(run).not.toHaveBeenCalled();
    },
  );

  it('gives the model the message of a rule that rejected the question, so it can correct itself', async () => {
    const { catalog } = build([
      tool('finanzas', 'reports.read', () =>
        Promise.reject(
          new InvalidInputException('«desde» debe ser una fecha.'),
        ),
      ),
    ]);

    const outcome = await catalog.execute(
      withPermissions('reports.read'),
      'finanzas',
      {},
    );

    expect(outcome).toEqual({
      content: '«desde» debe ser una fecha.',
      isError: true,
    });
  });

  it('gives the message of a "not found" too', async () => {
    const { catalog } = build([
      tool('finanzas', 'reports.read', () =>
        Promise.reject(
          new NotFoundDomainException('El fondo seleccionado no existe.'),
        ),
      ),
    ]);

    const outcome = await catalog.execute(
      withPermissions('reports.read'),
      'finanzas',
      {},
    );

    expect(outcome.content).toBe('El fondo seleccionado no existe.');
  });

  it('hides an unexpected failure behind a generic message, and logs it without the arguments', async () => {
    const { catalog, error } = build([
      tool('finanzas', 'reports.read', () =>
        Promise.reject(new Error('connect ECONNREFUSED 10.0.0.5:3306')),
      ),
    ]);

    const outcome = await catalog.execute(
      withPermissions('reports.read'),
      'finanzas',
      {
        secretoDelUsuario: 'no debe salir',
      },
    );

    expect(outcome).toEqual({
      content: 'La consulta falló. Intenta de nuevo más tarde.',
      isError: true,
    });
    expect(outcome.content).not.toContain('ECONNREFUSED');
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0][0])).not.toContain('no debe salir');
  });

  it('cuts an answer that is too long, and says how to ask for less', async () => {
    const big = { texto: 'x'.repeat(MAX_TOOL_OUTPUT_CHARS * 2) };
    const { catalog } = build([
      tool('finanzas', 'reports.read', () => Promise.resolve(big)),
    ]);

    const outcome = await catalog.execute(
      withPermissions('reports.read'),
      'finanzas',
      {},
    );

    expect(outcome.isError).toBe(false);
    expect(outcome.content.length).toBeLessThan(MAX_TOOL_OUTPUT_CHARS + 200);
    expect(outcome.content).toContain('respuesta recortada');
  });
});
