/**
 * @jest-environment jsdom
 */
import { INTELLIGENCE_ERROR_CODES, type AgentStatusResponse } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as React from 'react';

import { AppLayout } from '../../../components/nimbo/app-layout';
import { ApiClientError } from '../../../lib/api-error';
import type { AgentScope } from '../agent-scope';
import type { AgentConversationDeps } from '../hooks/use-agent-conversation';
import { agentStatus, FILE_ID } from '../test-agent';

import { AgentPanelConnector } from './agent-panel-connector';
import { AgentProvider, useAgent } from './agent-provider';

const push = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const PINNED: AgentScope = { type: 'file', id: FILE_ID, name: 'Contrato_2026.pdf' };

/** Un tercero que abre el agente con un ámbito, como hará «Preguntar sobre esto» (T-08). */
function AskAboutFile(): React.JSX.Element {
  const { open } = useAgent();
  return (
    <button type="button" onClick={() => open(PINNED)}>
      Preguntar sobre esto
    </button>
  );
}

function renderConnected(
  status: AgentStatusResponse = agentStatus(),
  ask: AgentConversationDeps['ask'] = jest.fn(),
): void {
  const deps: AgentConversationDeps = { loadStatus: () => Promise.resolve(status), ask };
  render(
    <AgentProvider deps={deps}>
      <AgentPanelConnector folderContents={jest.fn()}>
        <AppLayout>
          <AskAboutFile />
        </AppLayout>
      </AgentPanelConnector>
    </AgentProvider>,
  );
}

async function openFromNav(): Promise<void> {
  const nav = screen.getByRole('navigation', { name: 'Navegación principal' });
  await userEvent.click(within(nav).getByRole('button', { name: 'Agente Nimbo' }));
}

const panel = (): HTMLElement => screen.getByRole('complementary', { name: 'Agente Nimbo' });

describe('AgentPanelConnector (020b D-4)', () => {
  beforeEach(() => push.mockReset());

  it('CA-1: «Agente Nimbo» abre el panel con el contador, la renovación y «Todos mis archivos»', async () => {
    renderConnected();
    expect(screen.queryByRole('complementary', { name: 'Agente Nimbo' })).toBeNull();

    await openFromNav();

    expect(within(panel()).getByText('3 de 20 consultas este mes')).toBeTruthy();
    expect(within(panel()).getByText(/Se renuevan el/)).toBeTruthy();
    expect(
      within(panel()).getByRole('button', { name: /Ámbito\s*Todos mis archivos/ }),
    ).toBeTruthy();
  });

  it('«Cerrar el agente» lo desmonta', async () => {
    renderConnected();
    await openFromNav();

    await userEvent.click(within(panel()).getByRole('button', { name: 'Cerrar el agente' }));

    expect(screen.queryByRole('complementary', { name: 'Agente Nimbo' })).toBeNull();
  });

  it('CA-8: con las consultas agotadas al abrir, el aviso con «Ver planes»', async () => {
    renderConnected(agentStatus({ used: 20, limit: 20 }));

    await openFromNav();

    expect(within(panel()).getByText(/Usaste tus 20 consultas de este mes/)).toBeTruthy();
    expect(within(panel()).getByRole('link', { name: 'Ver planes' }).getAttribute('href')).toBe(
      '/suscripcion/cambiar-plan',
    );
  });

  it('CA-8, RN-5: la API rechaza por cuota en solo lectura y ofrece «Renovar plan»', async () => {
    const quotaExceeded = new ApiClientError({
      code: INTELLIGENCE_ERROR_CODES.AGENT_QUOTA_EXCEEDED,
      message: 'quota',
      correlationId: 'corr-1',
      details: { limit: 20 },
    });
    const ask = (): AsyncIterable<never> => ({
      [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(quotaExceeded) }),
    });
    renderConnected(agentStatus(), ask);
    await openFromNav();

    await userEvent.type(within(panel()).getByRole('textbox'), '¿Cuál es el plazo?');
    await userEvent.click(within(panel()).getByRole('button', { name: 'Enviar pregunta' }));

    const renew = await within(panel()).findByRole('link', { name: 'Renovar plan' });
    expect(renew.getAttribute('href')).toBe('/suscripcion/renovar');
  });

  it('CA-2: sin archivos indexados, «Subir archivos» cierra el panel y lleva a Mis archivos', async () => {
    renderConnected(agentStatus({ hasIndexedFiles: false }));
    await openFromNav();

    await userEvent.click(within(panel()).getByRole('button', { name: 'Subir archivos' }));

    expect(push).toHaveBeenCalledWith('/archivos');
    expect(screen.queryByRole('complementary', { name: 'Agente Nimbo' })).toBeNull();
  });

  it('CA-14: abrir con un archivo lo muestra como ámbito y el selector lo cambia', async () => {
    renderConnected();

    await userEvent.click(screen.getByRole('button', { name: 'Preguntar sobre esto' }));
    const trigger = within(panel()).getByRole('button', { name: /Ámbito/ });
    expect(trigger.textContent).toContain('Contrato_2026.pdf');

    await userEvent.click(trigger);
    await userEvent.click(await screen.findByRole('menuitemradio', { name: /Todos mis archivos/ }));
    await act(async () => undefined);

    expect(within(panel()).getByRole('button', { name: /Ámbito/ }).textContent).toContain(
      'Todos mis archivos',
    );
  });
});
