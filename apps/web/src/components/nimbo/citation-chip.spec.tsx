/**
 * @jest-environment jsdom
 */
import type { AgentCitationEvent } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import { axe } from 'jest-axe';

import { CitationChip } from './citation-chip';

const FILE_ID = '3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

function citation(overrides: Partial<AgentCitationEvent> = {}): AgentCitationEvent {
  return {
    type: 'citation',
    ordinal: 1,
    fileId: FILE_ID,
    versionId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    fileName: 'Contrato_La_Ceiba.pdf',
    label: 'Página 7',
    isCertain: true,
    ...overrides,
  };
}

describe('CitationChip (020b CA-3, CA-6, CA-11)', () => {
  it('CA-3: muestra la etiqueta tal como llega del servidor y el archivo completo al pasar el cursor', () => {
    render(<CitationChip citation={citation()} />);

    const chip = screen.getByRole('link', { name: 'Abrir Contrato_La_Ceiba.pdf, Página 7' });
    expect(chip.textContent).toBe('Página 7');
    expect(chip.getAttribute('title')).toBe('Contrato_La_Ceiba.pdf · Página 7');
  });

  it('CA-11 (S-6): abre la ficha del archivo con solo la etiqueta en `ubicacion`, nunca el nombre', () => {
    render(<CitationChip citation={citation({ label: 'Hoja «Ventas» & fila 3' })} />);

    const href = screen.getByRole('link').getAttribute('href') ?? '';
    expect(href).toBe(
      `/archivos/archivo/${FILE_ID}?ubicacion=${encodeURIComponent('Hoja «Ventas» & fila 3')}`,
    );
    expect(href).not.toContain('Contrato');
  });

  it('CA-6: la cita incierta lleva ícono y borde discontinuo, sin repetir «ubicación aproximada»', () => {
    const label = 'Página 7 (ubicación aproximada)';
    render(<CitationChip citation={citation({ label, isCertain: false })} />);

    const chip = screen.getByRole('link', { name: `Abrir Contrato_La_Ceiba.pdf, ${label}` });
    expect(chip.className).toContain('border-dashed');
    expect(chip.querySelector('svg[data-icon="aproximada"]')).not.toBeNull();
    expect(chip.textContent?.match(/ubicación aproximada/g)).toHaveLength(1);
    expect(chip.getAttribute('aria-label')?.match(/ubicación/g)).toHaveLength(1);
  });

  it('CA-6: la cita certera tiene borde continuo y otro ícono', () => {
    render(<CitationChip citation={citation()} />);

    const chip = screen.getByRole('link');
    expect(chip.className).not.toContain('border-dashed');
    expect(chip.querySelector('svg[data-icon="aproximada"]')).toBeNull();
  });

  it('CA-19: no presenta violaciones de accesibilidad', async () => {
    const { container } = render(
      <p>
        <CitationChip citation={citation()} />
        <CitationChip
          citation={citation({ label: 'p. 2 (ubicación aproximada)', isCertain: false })}
        />
      </p>,
    );

    // `next/link` actualiza su estado al observar la vista; axe corre dentro de `act` para no dejar avisos.
    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
