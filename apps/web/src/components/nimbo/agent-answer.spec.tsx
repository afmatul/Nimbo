/**
 * @jest-environment jsdom
 */
import type { AgentCitationEvent } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { AgentAnswer, type AgentAnswerProps } from './agent-answer';

const QUESTION = '¿Qué plazo de entrega tiene el contrato?';

function citation(
  ordinal: number,
  overrides: Partial<AgentCitationEvent> = {},
): AgentCitationEvent {
  return {
    type: 'citation',
    ordinal,
    fileId: `3f2b1c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5${String(ordinal)}`,
    versionId: '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d',
    fileName: `Contrato_${String(ordinal)}.pdf`,
    label: `Página ${String(ordinal)}`,
    isCertain: true,
    ...overrides,
  };
}

function renderAnswer(overrides: Partial<AgentAnswerProps> = {}): HTMLElement {
  render(
    <AgentAnswer question={QUESTION} text="" citations={{}} isStreaming={false} {...overrides} />,
  );
  return screen.getByRole('article', { name: 'Respuesta del agente' });
}

describe('AgentAnswer (020b CA-3, CA-6, CA-13)', () => {
  it('CA-3: muestra la pregunta y sustituye cada [n] por el chip de su cita', () => {
    const answer = renderAnswer({
      text: 'Entrega a 30 días [1]. Pago a 45 días [2].',
      citations: { 1: citation(1), 2: citation(2) },
    });

    expect(screen.getByText(QUESTION)).toBeTruthy();
    const chips = within(answer).getAllByRole('link');
    expect(chips.map((chip) => chip.getAttribute('aria-label'))).toEqual([
      'Abrir Contrato_1.pdf, Página 1',
      'Abrir Contrato_2.pdf, Página 2',
    ]);
    expect(answer.textContent).not.toContain('[1]');
    expect(answer.textContent).toContain('Entrega a 30 días ');
  });

  it('CA-3: las citas de un párrafo van una sola vez al final y sin repetirse', () => {
    const same = { fileId: citation(1).fileId, label: 'Página 1' };
    renderAnswer({
      text: 'Entrega a 30 días [1]. Pago a 45 días [2].\n\nGarantía de un año [3].',
      citations: { 1: citation(1), 2: citation(2, same), 3: citation(3) },
    });

    const first = screen.getByText(/Entrega a 30 días/);
    const second = screen.getByText(/Garantía de un año/);
    expect(within(first).getAllByRole('link')).toHaveLength(1);
    expect(first.lastElementChild?.getAttribute('aria-label')).toBe(
      'Abrir Contrato_1.pdf, Página 1',
    );
    expect(within(second).getAllByRole('link')).toHaveLength(1);
  });

  it('CA-3 (RN-2): un [n] sin cita recibida queda como texto', () => {
    const answer = renderAnswer({ text: 'Según [1] y [3].', citations: { 1: citation(1) } });

    expect(within(answer).getAllByRole('link')).toHaveLength(1);
    expect(answer.textContent).toContain('[3]');
  });

  it('CA-13: HTML, Markdown, enlaces e imágenes se muestran como texto plano', () => {
    const text =
      '<img src="https://x.test/a.png?d=1"> [aquí](https://x.test) ![i](https://x.test/i.png) https://x.test <a href="https://x.test">enlace</a>';
    const answer = renderAnswer({ text });

    expect(answer.querySelector('img, a, strong, script')).toBeNull();
    expect(answer.textContent).toContain(text);
  });

  it('**texto** se muestra en negrita sin los asteriscos', () => {
    const answer = renderAnswer({ text: 'Es **importante** y **clave**.' });

    expect(answer.querySelectorAll('strong')).toHaveLength(2);
    expect(answer.textContent).toContain('Es importante y clave.');
  });

  it('CA-6: con una cita incierta muestra el aviso de ubicación aproximada', () => {
    renderAnswer({
      text: 'Entrega a 30 días [1].',
      citations: { 1: citation(1, { label: 'Página 1 (ubicación aproximada)', isCertain: false }) },
    });

    expect(screen.getByText('La ubicación de esta cita es aproximada')).toBeTruthy();
  });

  it('CA-6: sin citas inciertas no hay aviso', () => {
    renderAnswer({ text: 'Entrega [1].', citations: { 1: citation(1) } });

    expect(screen.queryByText('La ubicación de esta cita es aproximada')).toBeNull();
  });

  it('CA-3: en curso muestra «Escribiendo…» y «Detener», que llama a onStop', async () => {
    const onStop = jest.fn();
    renderAnswer({ text: 'Entrega', isStreaming: true, onStop });

    expect(screen.getByRole('status').textContent).toContain('Escribiendo…');
    await userEvent.click(screen.getByRole('button', { name: 'Detener' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('CA-3: terminada no muestra «Escribiendo…» ni «Detener»', () => {
    renderAnswer({ text: 'Entrega', onStop: jest.fn() });

    expect(screen.queryByText('Escribiendo…')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Detener' })).toBeNull();
  });

  it('CA-19: el indicador en vivo no se anima con reduced-motion', () => {
    const answer = renderAnswer({ text: 'Entrega', isStreaming: true, onStop: jest.fn() });

    const animated = answer.querySelectorAll('[class*="animate-"]');
    expect(animated.length).toBeGreaterThan(0);
    animated.forEach((node) => expect(node.className).toContain('motion-reduce:animate-none'));
  });

  it('CA-19: no presenta violaciones de accesibilidad dentro del registro de la conversación', async () => {
    const { container } = render(
      <div role="log" aria-label="Conversación con el agente" aria-live="polite">
        <AgentAnswer
          question={QUESTION}
          text="Entrega [1]."
          citations={{
            1: citation(1, { label: 'Página 1 (ubicación aproximada)', isCertain: false }),
          }}
          isStreaming
          onStop={jest.fn()}
        />
      </div>,
    );

    // `next/link` actualiza su estado al observar la vista; axe corre dentro de `act` para no dejar avisos.
    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
