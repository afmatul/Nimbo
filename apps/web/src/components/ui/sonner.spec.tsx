/**
 * @jest-environment jsdom
 */
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { toast } from 'sonner';

import { APP_HEADER_HEIGHT, NOTICE_DURATION_MS, showNotice, Toaster } from './sonner';

const MESSAGE = 'Movimos «informe.docx» a la papelera.';
const RAW_COLOR = /#[0-9a-f]{3,8}\b/i;

async function renderWithNotice(onAction = jest.fn()): Promise<jest.Mock> {
  render(<Toaster />);
  await act(async () => {
    showNotice(MESSAGE, {
      action: (
        <button type="button" onClick={onAction}>
          Ver papelera
        </button>
      ),
    });
  });
  return onAction;
}

afterEach(async () => {
  await act(async () => {
    toast.dismiss();
  });
  jest.useRealTimers();
});

describe('Toaster (ADR-0024)', () => {
  it('CA-10: el aviso se anuncia en una región role="status" con aria-live="polite"', async () => {
    await renderWithNotice();

    const region = screen.getByRole('status', { name: 'Avisos' });
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(await screen.findByText(MESSAGE)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Cerrar aviso' })).toBeTruthy();
  });

  it('CA-18: la región queda arriba y al centro, debajo del encabezado, y dura 8 s', async () => {
    await renderWithNotice();
    await screen.findByText(MESSAGE);

    const list = document.querySelector<HTMLElement>('[data-sonner-toaster]');
    expect(list?.getAttribute('data-y-position')).toBe('top');
    expect(list?.getAttribute('data-x-position')).toBe('center');
    expect(list?.style.getPropertyValue('--offset-top')).toContain(APP_HEADER_HEIGHT);
    expect(list?.style.getPropertyValue('--mobile-offset-top')).toContain(APP_HEADER_HEIGHT);
    expect(NOTICE_DURATION_MS).toBe(8_000);
  });

  it('CA-10: la acción se alcanza y se activa con el teclado', async () => {
    const onAction = await renderWithNotice();
    const action = await screen.findByRole('button', { name: 'Ver papelera' });

    action.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.keyboard(' ');

    expect(onAction).toHaveBeenCalledTimes(2);
  });

  it('CA-25: dura al menos 8 s y no se cierra mientras tiene el foco', async () => {
    jest.useFakeTimers();
    await renderWithNotice();
    const action = await screen.findByRole('button', { name: 'Ver papelera' });

    await act(async () => {
      action.focus();
    });
    await act(async () => {
      jest.advanceTimersByTime(NOTICE_DURATION_MS * 2);
    });

    expect(screen.getByText(MESSAGE)).toBeTruthy();
  });

  it('CA-25: sin foco ni puntero, sigue visible antes de 8 s', async () => {
    jest.useFakeTimers();
    await renderWithNotice();
    await screen.findByText(MESSAGE);

    await act(async () => {
      jest.advanceTimersByTime(NOTICE_DURATION_MS - 1_000);
    });

    expect(screen.getByText(MESSAGE)).toBeTruthy();
  });

  it('CA-25: sin interacción se cierra solo pasado el tiempo', async () => {
    jest.useFakeTimers();
    await renderWithNotice();
    await screen.findByText(MESSAGE);

    await act(async () => {
      jest.advanceTimersByTime(NOTICE_DURATION_MS * 2);
    });

    expect(screen.queryByText(MESSAGE)).toBeNull();
  });

  it('CA-25: solo tokens y sin violaciones de axe', async () => {
    const { container } = render(<Toaster />);
    await act(async () => {
      showNotice(MESSAGE);
    });
    await screen.findByText(MESSAGE);

    expect(document.body.innerHTML).not.toMatch(RAW_COLOR);
    const results = await act(async () => axe(container));
    expect(results.violations).toEqual([]);
  });
});
