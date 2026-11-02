/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import type * as React from 'react';

import { forgetSession, rememberSession } from '../../../features/identity/session/session-memory';
import { SessionProvider } from '../../../features/identity/session/session-provider';
import { sessionFixture } from '../../../features/identity/session/test-session';
import { useAgent } from '../../../features/intelligence/components/agent-provider';

import ClienteGroupLayout from './layout';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

function group(page: React.ReactNode): React.JSX.Element {
  return (
    <SessionProvider apiPublicUrl="http://localhost/api/v1">
      <ClienteGroupLayout>{page}</ClienteGroupLayout>
    </SessionProvider>
  );
}

async function renderGroup(role: RoleName): Promise<void> {
  rememberSession(sessionFixture({ role }));
  render(group(<p>Contenido de cliente</p>));
  await act(async () => undefined);
}

/** Una página que abre el agente con un ámbito y dice cuál está vigente. */
function AgentProbe({ name }: { readonly name: string }): React.JSX.Element {
  const { open, conversation } = useAgent();
  const { scope } = conversation.state;
  return (
    <>
      <h1>{name}</h1>
      <button type="button" onClick={() => open({ type: 'folder', id: 'f-1', name: 'Finanzas' })}>
        Preguntar sobre Finanzas
      </button>
      <p>{`Ámbito: ${scope.type === 'all' ? 'todos' : scope.name}`}</p>
    </>
  );
}

describe('grupo (cliente)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
    replace.mockReset();
    global.fetch = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();
    forgetSession();
  });

  it('CA-17: el cliente entra a sus rutas', async () => {
    await renderGroup('CLIENT');

    expect(screen.getByText('Contenido de cliente')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('CA-21 (005): envuelve las páginas del cliente con el proveedor de cargas, sin panel mientras no hay cargas', async () => {
    await renderGroup('CLIENT');

    expect(screen.getByText('Contenido de cliente')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /panel de cargas/ })).toBeNull();
  });

  it('020b CA-17: navegar entre páginas del cliente conserva la sesión del agente, sin guardarla en el navegador', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    rememberSession(sessionFixture({ role: 'CLIENT' }));
    const { rerender } = render(group(<AgentProbe name="Mis archivos" />));
    await act(async () => undefined);

    await act(async () => screen.getByRole('button', { name: 'Preguntar sobre Finanzas' }).click());
    rerender(group(<AgentProbe name="Papelera" />));

    expect(screen.getByRole('heading', { name: 'Papelera' })).toBeTruthy();
    expect(screen.getByText('Ámbito: Finanzas')).toBeTruthy();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('007 D-15: monta el resumen de espacio compartido, que se pide una vez a GET /storage/summary', async () => {
    await renderGroup('CLIENT');

    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls.filter((url) => url.endsWith('/storage/summary'))).toHaveLength(1);
  });

  it('CA-17: un rol interno no llega a pedir el resumen de espacio', async () => {
    await renderGroup('ADMIN');

    const urls = jest.mocked(global.fetch).mock.calls.map(([url]) => String(url));
    expect(urls.some((url) => url.endsWith('/storage/summary'))).toBe(false);
  });

  it.each(['ADMIN', 'SUPPORT', 'OPERATOR'] as const)(
    'CA-17: %s que abre una ruta de cliente vuelve a /interno sin verla',
    async (role) => {
      await renderGroup(role);

      expect(replace).toHaveBeenCalledWith('/interno');
      expect(screen.queryByText('Contenido de cliente')).toBeNull();
    },
  );
});
