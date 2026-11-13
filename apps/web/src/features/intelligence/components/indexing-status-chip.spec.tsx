/**
 * @jest-environment jsdom
 */
import type { IndexingState } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { indexingStatus, NOT_INDEXED_TYPE } from '../test-indexing';

import { IndexingPill, IndexingStatusChip } from './indexing-status-chip';

const CHIPS: readonly (readonly [IndexingState, string, string | null])[] = [
  ['pendiente', 'Indexando…', 'Ya puedes seguir trabajando'],
  ['indexando', 'Indexando…', 'Ya puedes seguir trabajando'],
  ['indexado', 'Indexado', 'Listo para consultar con el agente'],
  ['no_indexable', 'No se indexa', 'Se busca solo por nombre'],
  ['fallido', 'No se pudo indexar', null],
];

const REASON_OF: Partial<Record<IndexingState, 'sin_texto' | 'error_interno'>> = {
  no_indexable: 'sin_texto',
  fallido: 'error_interno',
};

describe('IndexingStatusChip (019 CA-14)', () => {
  it.each(CHIPS)('CA-14: `%s` dice «%s» con su frase', async (state, label, hint) => {
    render(
      <main>
        <IndexingStatusChip status={indexingStatus({ state, reason: REASON_OF[state] ?? null })} />
      </main>,
    );

    expect(screen.getByText(label).textContent).toBe(label);
    expect(screen.getByText(label).parentElement?.textContent).toBe(
      `Estado de indexación: ${label}`,
    );
    if (hint) expect(screen.getByText(hint)).toBeTruthy();
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('CA-6: imágenes y «otros» (`state: null`) no muestran chip', () => {
    const { container } = render(<IndexingStatusChip status={NOT_INDEXED_TYPE} />);

    expect(container.textContent).toBe('');
  });

  it('sin estado leído no muestra chip', () => {
    const { container } = render(<IndexingStatusChip status={null} />);

    expect(container.textContent).toBe('');
  });
});

describe('IndexingPill en la tarjeta (compact)', () => {
  it.each([
    ['indexado', 'Indexado'],
    ['pendiente', 'Indexando…'],
    ['indexando', 'Indexando…'],
    ['no_indexable', 'Sin indexar'],
    ['fallido', 'Sin indexar'],
  ] as const)('`%s` dice «%s», sin porcentaje', (state, label) => {
    render(
      <IndexingPill compact status={indexingStatus({ state, reason: REASON_OF[state] ?? null })} />,
    );
    expect(screen.getByText(label)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/%/);
  });

  it('sin estado (tipo que no se indexa) no dibuja nada', () => {
    const { container } = render(<IndexingPill compact status={NOT_INDEXED_TYPE} />);
    expect(container.firstChild).toBeNull();
  });
});
