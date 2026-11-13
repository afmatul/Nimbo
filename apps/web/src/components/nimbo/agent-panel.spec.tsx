/**
 * @jest-environment jsdom
 */
import type { AgentCitationEvent, AgentStatusResponse } from '@nimbo/contracts';
import { act, cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import * as React from 'react';

import {
  AgentPanel,
  type AgentPanelNotice,
  type AgentPanelProps,
  type AgentPanelTurn,
} from './agent-panel';

const SHEET_MAX_WIDTH = 900;

function status(overrides: Partial<AgentStatusResponse> = {}): AgentStatusResponse {
  return {
    used: 142,
    limit: 2000,
    resetsAt: '2026-11-14T06:00:00.000Z',
    hasIndexedFiles: true,
    maxQuestionChars: 1000,
    ...overrides,
  };
}

function citation(ordinal: number, isCertain = true): AgentCitationEvent {
  return {
    type: 'citation',
    ordinal,
    fileId: `7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4${String(ordinal)}`,
    versionId: '9c0d1e2f-2f0c-4c5d-8e6f-3a4b4c5d8e6f',
    fileName: `Contrato_${String(ordinal)}.docx`,
    label: isCertain ? 'Página 3' : 'Página 7 (ubicación aproximada)',
    isCertain,
  };
}

function turn(overrides: Partial<AgentPanelTurn> = {}): AgentPanelTurn {
  return {
    id: 1,
    question: '¿Cuántas consultas incluye el plan Equipo?',
    text: 'Incluye 2 000 consultas mensuales [1].',
    citations: { 1: citation(1) },
    ...overrides,
  };
}

/** Ancho de ventana simulado: `matchMedia` responde a `(max-width: 900px)` como el navegador. */
function setViewport(width: number): void {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: (query: string) => ({
      matches: width <= SHEET_MAX_WIDTH,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

function props(overrides: Partial<AgentPanelProps> = {}): AgentPanelProps {
  return {
    screen: 'inicio',
    status: status(),
    turns: [],
    scopeControl: <button type="button">Ámbito Todos mis archivos</button>,
    onAsk: jest.fn(() => true),
    onStop: jest.fn(),
    onUploadFiles: jest.fn(),
    onClose: jest.fn(),
    notice: null,
    onRetry: jest.fn(),
    ...overrides,
  };
}

function renderPanel(overrides: Partial<AgentPanelProps> = {}): AgentPanelProps {
  const panelProps = props(overrides);
  render(<AgentPanel {...panelProps} />);
  return panelProps;
}

const conversation = (): HTMLElement =>
  screen.getByRole('log', { name: 'Conversación con el agente' });
const questionField = (): HTMLElement =>
  screen.getByRole('textbox', { name: 'Pregunta sobre tus documentos' });

beforeEach(() => setViewport(1440));

describe('AgentPanel (020b CA-1, CA-2, CA-3, CA-5, CA-17, CA-19)', () => {
  it('CA-1: muestra «N de L consultas este mes», la fecha de renovación y el ámbito vigente', () => {
    renderPanel();

    expect(screen.getByRole('heading', { name: 'Agente Nimbo' })).toBeTruthy();
    expect(screen.getByText('142 de 2 000 consultas este mes')).toBeTruthy();
    expect(screen.getByText('Se renuevan el 14 de noviembre')).toBeTruthy();
    const meter = screen.getByRole('progressbar', { name: 'Consultas usadas este mes' });
    expect(meter.getAttribute('aria-valuenow')).toBe('142');
    expect(meter.getAttribute('aria-valuemax')).toBe('2000');
    expect(screen.getByRole('button', { name: 'Ámbito Todos mis archivos' })).toBeTruthy();
  });

  it.each([
    [10, 20, 'normal'],
    [14, 20, 'warning'],
    [20, 20, 'full'],
  ] as const)('CA-1: el medidor con %i de %i usa el tramo %s', (used, limit, tier) => {
    renderPanel({ status: status({ used, limit }) });

    const meter = screen.getByRole('progressbar', { name: 'Consultas usadas este mes' });
    expect(meter.getAttribute('data-tier')).toBe(tier);
  });

  it('CA-1: agotadas, dice «Sin consultas disponibles» en lugar de la fecha', () => {
    renderPanel({ status: status({ used: 20, limit: 20 }) });

    expect(screen.getByText('Sin consultas disponibles')).toBeTruthy();
    expect(screen.queryByText(/Se renuevan el/)).toBeNull();
  });

  it('inicio: invita a preguntar sobre los documentos', () => {
    renderPanel();

    expect(
      within(conversation()).getByRole('heading', { name: 'Pregunta sobre tus documentos' }),
    ).toBeTruthy();
  });

  it('CA-2: vacío explica los formatos que se indexan (S-2) y ofrece «Subir archivos»', async () => {
    const { onUploadFiles } = renderPanel({
      screen: 'vacio',
      status: status({ hasIndexedFiles: false }),
    });

    const formats = within(conversation()).getByRole('list', { name: 'Formatos que se indexan' });
    expect(
      within(formats)
        .getAllByRole('listitem')
        .map((item) => item.textContent),
    ).toEqual(['.docx Word', '.pdf con texto', '.txt', '.md', '.xlsx Excel', '.pptx PowerPoint']);
    await userEvent.click(screen.getByRole('button', { name: 'Subir archivos' }));
    expect(onUploadFiles).toHaveBeenCalledTimes(1);
  });

  it('CA-2 (S-4): sin archivos indexados el campo sigue activo', () => {
    renderPanel({ screen: 'vacio', status: status({ hasIndexedFiles: false }) });

    expect(questionField().hasAttribute('disabled')).toBe(false);
  });

  it('cargando: muestra la carga hasta leer el estado, sin contador', () => {
    renderPanel({ screen: 'cargando', status: null });

    expect(screen.getByRole('status').textContent).toContain('Cargando el agente…');
    expect(screen.queryByRole('progressbar')).toBeNull();
  });

  it('CA-3: envía la pregunta y vacía el campo si se aceptó', async () => {
    const { onAsk } = renderPanel();

    await userEvent.type(questionField(), '¿Qué plazo tiene?');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

    expect(onAsk).toHaveBeenCalledWith('¿Qué plazo tiene?');
    expect((questionField() as HTMLTextAreaElement).value).toBe('');
  });

  it('CA-3: si no se aceptó, conserva lo escrito', async () => {
    renderPanel({ onAsk: jest.fn(() => false) });

    await userEvent.type(questionField(), 'Hola');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));

    expect((questionField() as HTMLTextAreaElement).value).toBe('Hola');
  });

  it('CA-3: el contador de caracteres usa el máximo de la API', async () => {
    renderPanel({ status: status({ maxQuestionChars: 1200 }) });

    await userEvent.type(questionField(), 'Hola');

    expect(screen.getByText('4 / 1 200')).toBeTruthy();
  });

  it('CA-3: respondiendo, el campo se apaga con su motivo y el último turno se escribe con «Detener»', async () => {
    const { onStop } = renderPanel({ screen: 'respondiendo', turns: [turn()] });

    const field = questionField();
    expect(field.hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Enviar pregunta' }).hasAttribute('disabled')).toBe(
      true,
    );
    const reason = screen.getByText('Escribiendo… Podrás preguntar de nuevo cuando termine.');
    expect(field.getAttribute('aria-describedby')).toContain(reason.id);
    expect(conversation().getAttribute('aria-busy')).toBe('true');
    await userEvent.click(within(conversation()).getByRole('button', { name: 'Detener' }));
    expect(onStop).toHaveBeenCalledTimes(1);
  });

  it('con-citas: pinta cada turno con sus chips y la conversación queda en vivo y sin ocupar', () => {
    renderPanel({
      screen: 'con-citas',
      turns: [turn(), turn({ id: 2, question: 'Otra', text: 'Sí [1].' })],
    });

    const log = conversation();
    expect(log.getAttribute('aria-live')).toBe('polite');
    expect(log.hasAttribute('aria-busy')).toBe(false);
    expect(within(log).getAllByRole('article', { name: 'Respuesta del agente' })).toHaveLength(2);
    expect(
      within(log).getAllByRole('link', { name: 'Abrir Contrato_1.docx, Página 3' }),
    ).toHaveLength(2);
    expect(within(log).queryByRole('button', { name: 'Detener' })).toBeNull();
  });

  it('cita-incierta: el aviso lo pinta la respuesta', () => {
    renderPanel({
      screen: 'cita-incierta',
      turns: [turn({ citations: { 1: citation(1, false) } })],
    });

    expect(screen.getByText('La ubicación de esta cita es aproximada')).toBeTruthy();
  });

  it('CA-5: sin resultados, sugiere ampliar el ámbito y avisa que cuenta como consulta', () => {
    renderPanel({
      screen: 'sin-resultados',
      turns: [turn({ text: 'No encontré esto en tus documentos.', citations: {} })],
    });

    const log = conversation();
    expect(within(log).queryByRole('link')).toBeNull();
    expect(log.textContent).toContain('amplía el ámbito');
    expect(within(log).getByRole('status').textContent).toContain(
      'Esta respuesta cuenta como una consulta',
    );
  });

  it('CA-17: el pie dice que no se guardan las preguntas', () => {
    renderPanel();

    expect(
      screen.getByText(
        /Cada pregunta es independiente: no guardamos tus preguntas ni las respuestas/,
      ),
    ).toBeTruthy();
  });

  it('CA-19: en escritorio es un complemento no modal y lleva el foco al campo', () => {
    renderPanel();

    expect(screen.getByRole('complementary', { name: 'Agente Nimbo' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(questionField());
  });

  it('CA-19: Escape cierra el panel', async () => {
    const { onClose } = renderPanel();

    await userEvent.keyboard('{Escape}');

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe('a 360 px (hoja a pantalla completa)', () => {
    beforeEach(() => setViewport(360));

    function Opener(): React.JSX.Element {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            Agente Nimbo
          </button>
          <main>
            <a href="/archivos">Mis archivos</a>
          </main>
          {open && <AgentPanel {...props({ onClose: () => setOpen(false) })} />}
        </>
      );
    }

    it('CA-19: es modal, con «Cerrar el agente» y el fondo inert', async () => {
      render(<Opener />);
      await userEvent.click(screen.getByRole('button', { name: 'Agente Nimbo' }));

      const sheet = screen.getByRole('dialog', { name: 'Agente Nimbo' });
      expect(sheet.getAttribute('aria-modal')).toBe('true');
      expect(within(sheet).getByRole('button', { name: 'Cerrar el agente' })).toBeTruthy();
      expect(document.querySelector('main')?.hasAttribute('inert')).toBe(true);
    });

    it('CA-19: atrapa el foco dentro de la hoja', async () => {
      render(<Opener />);
      await userEvent.click(screen.getByRole('button', { name: 'Agente Nimbo' }));
      const close = screen.getByRole('button', { name: 'Cerrar el agente' });

      close.focus();
      await userEvent.tab({ shift: true });
      expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true);
      expect(document.activeElement).not.toBe(close);

      await userEvent.tab();
      expect(document.activeElement).toBe(close);
    });

    it('CA-19: al cerrar, quita el inert y el foco vuelve a quien lo abrió', async () => {
      render(<Opener />);
      const opener = screen.getByRole('button', { name: 'Agente Nimbo' });
      await userEvent.click(opener);

      await userEvent.click(screen.getByRole('button', { name: 'Cerrar el agente' }));

      expect(screen.queryByRole('dialog')).toBeNull();
      expect(document.querySelector('main')?.hasAttribute('inert')).toBe(false);
      expect(document.activeElement).toBe(opener);
    });
  });

  it.each([360, 1440])('CA-19: sin violaciones de axe a %i px', async (width) => {
    setViewport(width);
    renderPanel({ screen: 'vacio', status: status({ hasIndexedFiles: false }) });
    expect((await act(async () => axe(document.body))).violations).toEqual([]);
    cleanup();

    renderPanel({
      screen: 'respondiendo',
      turns: [turn({ citations: { 1: citation(1, false) } })],
    });
    expect((await act(async () => axe(document.body))).violations).toEqual([]);
    cleanup();

    renderPanel({
      screen: 'sin-resultados',
      turns: [turn({ text: 'No encontré esto en tus documentos.', citations: {} })],
    });
    expect((await act(async () => axe(document.body))).violations).toEqual([]);
  });
});

const QUOTA_NOTICE: AgentPanelNotice = {
  cause: 'Usaste tus 20 consultas de este mes. Se renuevan el 14 de noviembre.',
  fix: 'Mientras tanto, subir, descargar y buscar archivos funciona igual.',
  link: { label: 'Ver planes', href: '/suscripcion/cambiar-plan' },
};
const READ_ONLY_QUOTA_NOTICE: AgentPanelNotice = {
  cause: 'Usaste tus 20 consultas de este mes.',
  fix: 'Renueva tu plan para volver a preguntar.',
  link: { label: 'Renovar plan', href: '/suscripcion/renovar' },
};
const UNAVAILABLE_NOTICE: AgentPanelNotice = {
  cause: 'El agente no está disponible. Tus archivos siguen a salvo.',
  fix: 'No se descontó tu consulta. Inténtalo de nuevo en unos minutos.',
};
const TOO_LONG_NOTICE: AgentPanelNotice = {
  cause: 'Tu pregunta tiene 3 caracteres de más.',
  fix: 'Acórtala a 10 o menos para enviarla. No se descontó tu consulta.',
};
const EMPTY_NOTICE: AgentPanelNotice = {
  cause: 'Escribe una pregunta para consultar a tus documentos.',
  fix: 'No se descontó tu consulta.',
};
const SCOPE_NOTICE: AgentPanelNotice = {
  cause: 'Esa carpeta o archivo ya no está disponible.',
  fix: 'Elige otro ámbito.',
};
const exhausted = (resetsAt: string | null = '2026-11-14T06:00:00.000Z'): AgentStatusResponse =>
  status({ used: 20, limit: 20, resetsAt });

describe('AgentPanel: estados de fallo (020b CA-7, CA-8, CA-9, CA-16, RN-5)', () => {
  it('CA-8: límite alcanzado es un aviso (no error) con el mensaje, «Ver planes» y el campo apagado con su motivo', () => {
    renderPanel({ screen: 'limite-alcanzado', status: exhausted(), notice: QUOTA_NOTICE });

    const notice = within(conversation()).getByRole('status');
    expect(notice.textContent).toContain(QUOTA_NOTICE.cause);
    expect(notice.textContent).toContain(QUOTA_NOTICE.fix);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(within(notice).getByRole('link', { name: 'Ver planes' }).getAttribute('href')).toBe(
      '/suscripcion/cambiar-plan',
    );
    const field = questionField();
    expect(field.hasAttribute('disabled')).toBe(true);
    expect(field.getAttribute('placeholder')).toBe('Sin consultas disponibles');
    const reason = screen.getByText('Podrás preguntar de nuevo el 14 de noviembre.');
    expect(field.getAttribute('aria-describedby')).toContain(reason.id);
  });

  it('RN-5: en solo lectura sin fecha, ofrece «Renovar plan» y no muestra ninguna fecha', () => {
    renderPanel({
      screen: 'limite-alcanzado',
      status: exhausted(null),
      notice: READ_ONLY_QUOTA_NOTICE,
    });

    const link = screen.getByRole('link', { name: 'Renovar plan' });
    expect(link.getAttribute('href')).toBe('/suscripcion/renovar');
    expect(screen.queryByRole('link', { name: 'Ver planes' })).toBeNull();
    expect(document.body.textContent).not.toMatch(/de noviembre|Se renuevan/);
    expect(questionField().hasAttribute('disabled')).toBe(true);
  });

  it.each(['no-disponible', 'no-disponible-parcial'] as const)(
    'CA-9: %s avisa que el agente no está disponible, conserva lo recibido y «Reintentar» llama onRetry',
    async (failure) => {
      const { onRetry } = renderPanel({
        screen: failure,
        turns: [turn({ text: 'El plan Equipo incluye…', citations: {} })],
        notice: UNAVAILABLE_NOTICE,
      });

      const alert = within(conversation()).getByRole('alert');
      expect(alert.textContent).toContain(
        'El agente no está disponible. Tus archivos siguen a salvo.',
      );
      expect(alert.textContent).toContain(UNAVAILABLE_NOTICE.fix);
      expect(conversation().textContent).toContain('El plan Equipo incluye…');
      expect(questionField().hasAttribute('disabled')).toBe(false);
      await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
      expect(onRetry).toHaveBeenCalledTimes(1);
    },
  );

  it('CA-7: una pregunta larga marca el campo con los caracteres que sobran, la corrección y que no se descontó', async () => {
    const onAsk = jest.fn(() => false);
    const limited = status({ maxQuestionChars: 10 });
    const { rerender } = render(<AgentPanel {...props({ status: limited, onAsk })} />);
    await userEvent.type(questionField(), 'Trece letras.');
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
    rerender(
      <AgentPanel
        {...props({ screen: 'error-pregunta', status: limited, notice: TOO_LONG_NOTICE, onAsk })}
      />,
    );

    const field = questionField();
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const error = screen.getByText(/Tu pregunta tiene 3 caracteres de más\./).closest('p');
    expect(error?.textContent).toContain('No se descontó tu consulta.');
    expect(field.getAttribute('aria-describedby')?.split(' ')).toContain(error?.id);
    expect((field as HTMLTextAreaElement).value).toBe('Trece letras.');
    expect(screen.getByText('13 / 10')).toBeTruthy();
    expect(field.hasAttribute('disabled')).toBe(false);
  });

  it('CA-7: vacía, el campo marca el error y nada se envía', async () => {
    const onAsk = jest.fn(() => false);
    renderPanel({ screen: 'error-pregunta-vacia', notice: EMPTY_NOTICE, onAsk });

    expect(questionField().getAttribute('aria-invalid')).toBe('true');
    expect(screen.getByText(/Escribe una pregunta para consultar/).textContent).toContain(
      'No se descontó tu consulta.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Enviar pregunta' }));
    expect(onAsk).toHaveReturnedWith(false);
    expect(within(conversation()).queryByRole('alert')).toBeNull();
  });

  it('sin error, el campo no se marca inválido', () => {
    renderPanel();

    expect(questionField().hasAttribute('aria-invalid')).toBe(false);
  });

  it.each([
    ['ambito-no-disponible', SCOPE_NOTICE],
    ['error', UNAVAILABLE_NOTICE],
  ] as const)(
    'CA-16: %s muestra su mensaje como error y la pregunta puede reenviarse',
    (failure, notice) => {
      renderPanel({ screen: failure, turns: [turn()], notice });

      const alert = within(conversation()).getByRole('alert');
      expect(alert.textContent).toContain(notice.cause);
      expect(alert.textContent).toContain(notice.fix);
      expect(within(alert).queryByRole('button')).toBeNull();
      expect(questionField().hasAttribute('disabled')).toBe(false);
    },
  );

  it.each([360, 1440])('sin violaciones de axe a %i px en los estados de fallo', async (width) => {
    setViewport(width);
    const cases: readonly Partial<AgentPanelProps>[] = [
      { screen: 'limite-alcanzado', status: exhausted(), notice: QUOTA_NOTICE },
      { screen: 'limite-alcanzado', status: exhausted(null), notice: READ_ONLY_QUOTA_NOTICE },
      { screen: 'no-disponible', notice: UNAVAILABLE_NOTICE },
      { screen: 'no-disponible-parcial', turns: [turn()], notice: UNAVAILABLE_NOTICE },
      { screen: 'error-pregunta', notice: TOO_LONG_NOTICE },
      { screen: 'error-pregunta-vacia', notice: EMPTY_NOTICE },
      { screen: 'ambito-no-disponible', notice: SCOPE_NOTICE },
    ];
    for (const overrides of cases) {
      renderPanel(overrides);
      expect((await act(async () => axe(document.body))).violations).toEqual([]);
      cleanup();
    }
  });
});
