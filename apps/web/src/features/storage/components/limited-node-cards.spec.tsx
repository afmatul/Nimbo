/**
 * @jest-environment jsdom
 */
import type { NodeSummary } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { ListControls } from '../hooks/use-folder-contents';
import { DEFAULT_NODE_ORDER } from '../node-order';

import { CARDS_STEP, LimitedNodeCards } from './limited-node-cards';

const NOW = '2026-11-10T10:00:00.000Z';

function fileNode(index: number): NodeSummary {
  return {
    type: 'file',
    id: `a${String(index)}`,
    name: `archivo-${String(index)}.bin`,
    kind: 'otro',
    sizeBytes: '10',
    updatedAt: NOW,
  } as unknown as NodeSummary;
}

const nodesOf = (count: number): NodeSummary[] =>
  Array.from({ length: count }, (_, i) => fileNode(i));

function controlsWith(overrides: Partial<ListControls>): ListControls {
  return {
    order: DEFAULT_NODE_ORDER,
    shownOrder: DEFAULT_NODE_ORDER,
    sorting: false,
    more: 'idle',
    added: 0,
    hasMore: false,
    changeOrder: jest.fn(),
    loadMore: jest.fn(),
    dismissMoreError: jest.fn(),
    ...overrides,
  };
}

function renderCards(nodes: readonly NodeSummary[], controls?: ListControls): () => void {
  const view = (list: readonly NodeSummary[]): React.JSX.Element => (
    <LimitedNodeCards
      nodes={list}
      placeName="Mis archivos"
      renderRowActions={undefined}
      controls={controls}
    />
  );
  const { rerender } = render(view(nodes));
  return () => rerender(view(nodesOf(nodes.length + 50)));
}

const cardCount = (): number => screen.getAllByRole('listitem').length;

describe('LimitedNodeCards', () => {
  it(`muestra solo las primeras ${String(CARDS_STEP)} tarjetas y «Mostrar más» descubre las siguientes sin pedir`, async () => {
    const controls = controlsWith({ hasMore: true });
    renderCards(nodesOf(50), controls);
    expect(cardCount()).toBe(CARDS_STEP);

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar más' }));

    expect(cardCount()).toBe(CARDS_STEP * 2);
    expect(controls.loadMore).not.toHaveBeenCalled();
    expect(screen.getByRole('status').textContent).toBe(
      `Se cargaron ${String(CARDS_STEP)} elementos más.`,
    );
  });

  it('con todo lo cargado a la vista, «Mostrar más» pide la página siguiente y muestra parte de ella', async () => {
    const controls = controlsWith({ hasMore: true });
    const arrive = renderCards(nodesOf(10), controls);
    expect(cardCount()).toBe(10);

    await userEvent.click(screen.getByRole('button', { name: 'Mostrar más' }));
    expect(controls.loadMore).toHaveBeenCalledTimes(1);
    arrive();

    expect(cardCount()).toBe(10 + CARDS_STEP);
  });

  it('sin más tarjetas ni páginas no hay botón', () => {
    renderCards(nodesOf(5), controlsWith({ hasMore: false }));
    expect(screen.queryByRole('button', { name: 'Mostrar más' })).toBeNull();
  });

  it('sin paginación también limita y descubre lo cargado', async () => {
    renderCards(nodesOf(30));
    expect(cardCount()).toBe(CARDS_STEP);
    await userEvent.click(screen.getByRole('button', { name: 'Mostrar más' }));
    expect(cardCount()).toBe(30);
    expect(screen.queryByRole('button', { name: 'Mostrar más' })).toBeNull();
  });
});
