/**
 * @jest-environment jsdom
 */
import type { FileVersionSummary } from '@nimbo/contracts';
import { render, screen, within } from '@testing-library/react';
import { axe } from 'jest-axe';

import { dayLabel } from '../../lib/format-date';

import { VersionTimeline, type VersionTimelineProps } from './version-timeline';

const OWNER = '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d';
const NOW = Date.parse('2026-10-08T18:00:00.000Z');

function version(overrides: Partial<FileVersionSummary> & { number: number }): FileVersionSummary {
  return {
    id: `7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a${String(overrides.number).padStart(2, '0')}`,
    origin: 'carga',
    sizeBytes: 2_600_000,
    deltaBytes: null,
    restoredFromNumber: null,
    createdAt: '2026-10-08T16:42:00.000Z',
    createdById: OWNER,
    isCurrent: false,
    keptUntil: null,
    ...overrides,
  };
}

const V5 = version({ number: 5, deltaBytes: '200000', isCurrent: true });
const V4 = version({
  number: 4,
  origin: 'restauracion',
  restoredFromNumber: 2,
  sizeBytes: 2_400_000,
  deltaBytes: '-100000',
  createdAt: '2026-10-07T23:20:00.000Z',
});
const V3 = version({ number: 3, sizeBytes: 2_500_000, createdAt: '2026-10-02T15:15:00.000Z' });

function renderTimeline(overrides: Partial<VersionTimelineProps> = {}): void {
  render(
    <section aria-labelledby="historial">
      <h2 id="historial">Historial de versiones</h2>
      <VersionTimeline
        labelledBy="historial"
        versions={[V5, V4, V3]}
        viewerId={OWNER}
        now={NOW}
        renderActions={(item) => (
          <button type="button">{`Descargar la versión ${String(item.number)}`}</button>
        )}
        {...overrides}
      />
    </section>,
  );
}

function itemOf(number: number): HTMLElement {
  const items = within(screen.getByRole('list', { name: 'Historial de versiones' })).getAllByRole(
    'listitem',
  );
  const found = items.find((item) => item.textContent?.includes(`Versión ${String(number)}`));
  if (!found) throw new Error(`Sin la versión ${String(number)}`);
  return found;
}

describe('VersionTimeline (014 CA-6, CA-20)', () => {
  it.each([360, 1440])(
    '021 CA-15: marca solo el original con el keptUntil real y conserva acciones a %i px',
    async (width) => {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
      const keptUntil = '2027-01-15T16:00:00.000Z';
      renderTimeline({ versions: [V5, { ...V4, keptUntil }, V3] });
      const label = `Original conservado hasta ${dayLabel(keptUntil)} · no ocupa tu espacio`;
      expect(within(itemOf(4)).getByText(label)).toBeTruthy();
      expect(itemOf(5).textContent).not.toContain('Original conservado');
      expect(itemOf(3).textContent).not.toContain('Original conservado');
      expect(
        within(itemOf(4)).getByRole('button', { name: 'Descargar la versión 4' }),
      ).toBeTruthy();
      expect((await axe(document.body)).violations).toEqual([]);
    },
  );
  it('CA-6: lista de la más reciente a la más antigua con número, fecha, autor, origen y tamaño', () => {
    renderTimeline();

    const items = within(screen.getByRole('list', { name: 'Historial de versiones' })).getAllByRole(
      'listitem',
    );
    expect(items.map((item) => item.querySelector('p')?.textContent)).toEqual([
      'Versión 5ACTUAL',
      'Versión 4',
      'Versión 3',
    ]);
    const current = itemOf(5);
    expect(current.textContent).toContain('hoy, 10:42');
    expect(current.textContent).toContain(', por Tú');
    expect(current.textContent).toContain('Origen: Carga');
    expect(current.textContent).toContain('Tamaño: 2,6 MB');
    expect(current.textContent).toContain('+200 KB');
    expect(current.textContent).toContain('200 KB más que la versión 4');
  });

  it('CA-6: una restauración dice de qué versión viene y el cambio negativo en texto', () => {
    renderTimeline();

    const restored = itemOf(4);
    expect(restored.textContent).toContain('ayer, 17:20');
    expect(restored.textContent).toContain('Origen: Restauración de la versión 2');
    expect(restored.textContent).toContain('−100 KB');
    expect(restored.textContent).toContain('100 KB menos que la versión 3');
  });

  it('CA-6: sin anterior retenida dice «Sin comparación»; la primera versión, «Primera versión»', () => {
    renderTimeline({ versions: [V3, version({ number: 1 })] });

    expect(itemOf(3).textContent).toContain('Sin comparación: la versión 2 ya no se conserva');
    expect(itemOf(1).textContent).toContain('Primera versión');
    expect(itemOf(1).textContent).not.toContain('Sin comparación');
  });

  it('CA-6: una restauración cuyo número de origen no llegó dice solo «Restauración»', () => {
    renderTimeline({ versions: [version({ number: 2, origin: 'restauracion' })] });

    expect(itemOf(2).textContent).toContain('Origen: Restauración');
    expect(itemOf(2).textContent).not.toContain('de la versión');
  });

  it('CA-7 (D-9): el autor es «Tú» solo si es quien mira; otro autor no se nombra', () => {
    renderTimeline({ viewerId: '9f8e7d6c-5b4a-4c3d-8e2f-1a0b9c8d7e6f' });

    expect(itemOf(5).textContent).toContain(', por Otra persona');
  });

  it('CA-9: la versión recién restaurada lleva «NUEVA»', () => {
    renderTimeline({ highlightedId: V5.id });

    expect(itemOf(5).textContent).toContain('NUEVA');
    expect(itemOf(4).textContent).not.toContain('NUEVA');
  });

  it('CA-20: cada versión trae sus acciones', () => {
    renderTimeline();

    expect(within(itemOf(3)).getByRole('button', { name: 'Descargar la versión 3' })).toBeTruthy();
  });

  it('CA-20: sin violaciones de axe', async () => {
    renderTimeline({ highlightedId: V5.id });

    const results = await axe(document.body);
    expect(results.violations).toEqual([]);
  });
});
