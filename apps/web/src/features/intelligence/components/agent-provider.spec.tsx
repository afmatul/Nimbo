/**
 * @jest-environment jsdom
 */
import type { AgentStatusResponse } from '@nimbo/contracts';
import { act, renderHook } from '@testing-library/react';
import * as React from 'react';

import type { AgentScope } from '../agent-scope';
import type { AgentConversationDeps } from '../hooks/use-agent-conversation';
import { agentStatus, FOLDER_ID } from '../test-agent';

import { AgentProvider, useAgent } from './agent-provider';

const FOLDER: AgentScope = { type: 'folder', id: FOLDER_ID, name: 'Finanzas' };

function renderAgent() {
  const loadStatus = jest.fn<Promise<AgentStatusResponse>, []>().mockResolvedValue(agentStatus());
  const deps: AgentConversationDeps = { loadStatus, ask: jest.fn() };
  const wrapper = ({ children }: { readonly children: React.ReactNode }): React.JSX.Element => (
    <AgentProvider deps={deps}>{children}</AgentProvider>
  );
  return { ...renderHook(() => useAgent(), { wrapper }), loadStatus };
}

describe('AgentProvider', () => {
  it('empieza cerrado y sin leer el estado', () => {
    const { result, loadStatus } = renderAgent();

    expect(result.current.isOpen).toBe(false);
    expect(loadStatus).not.toHaveBeenCalled();
  });

  it('D-9: abrir muestra el panel y relee el contador; cerrar lo oculta', async () => {
    const { result, loadStatus } = renderAgent();

    await act(async () => result.current.open());
    expect(result.current.isOpen).toBe(true);
    expect(loadStatus).toHaveBeenCalledTimes(1);
    expect(result.current.conversation.screen).toBe('inicio');

    act(() => result.current.close());
    expect(result.current.isOpen).toBe(false);
  });

  it('CA-15: abrir con un ámbito lo deja vigente', async () => {
    const { result } = renderAgent();

    await act(async () => result.current.open(FOLDER));

    expect(result.current.conversation.state.scope).toEqual(FOLDER);
  });

  it('abrir sin ámbito conserva el vigente', async () => {
    const { result } = renderAgent();
    await act(async () => result.current.open(FOLDER));
    act(() => result.current.close());

    await act(async () => result.current.open());

    expect(result.current.conversation.state.scope).toEqual(FOLDER);
  });

  it('useAgent fuera del proveedor falla con un mensaje claro', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);

    expect(() => renderHook(() => useAgent())).toThrow(
      'useAgent debe usarse dentro de <AgentProvider>.',
    );
  });
});
