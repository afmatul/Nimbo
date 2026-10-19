/**
 * @jest-environment jsdom
 */
import { EDITING_EVENTS } from '@nimbo/contracts';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';
import { toast } from 'sonner';

import { RealtimeContext } from '../../realtime/use-realtime';
import { FakeRealtimeChannel, FILE_ID, SESSION_ID } from '../test-edit-session';

import { SaveFailedListener } from './save-failed-listener';

const push = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: Object.assign(jest.fn(), { error: jest.fn() }) }));

const OTHER_SESSION = '9c0d1e2f-2f0c-4c5d-8e6f-3a4b4c5d8e6f';

function renderListener(channel: FakeRealtimeChannel): void {
  render(
    <RealtimeContext.Provider value={channel}>
      <SaveFailedListener />
      <main>
        <p>Contenido de cualquier pantalla</p>
      </main>
    </RealtimeContext.Provider>,
  );
}

function failSession(channel: FakeRealtimeChannel, sessionId = SESSION_ID): void {
  act(() => channel.emit(EDITING_EVENTS.SAVE_FAILED, { sessionId, fileId: FILE_ID }));
}

describe('SaveFailedListener (016 CA-14)', () => {
  it('sin avisos no muestra nada', () => {
    renderListener(new FakeRealtimeChannel());

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('CA-14: al llegar `editing.save-failed` en cualquier pantalla aparece un aviso persistente, sin toast', async () => {
    const channel = new FakeRealtimeChannel();
    renderListener(channel);

    failSession(channel);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos guardar los cambios de un documento');
    expect(alert.textContent).toContain('Tu versión anterior está intacta');
    expect(screen.getByText('Contenido de cualquier pantalla')).toBeTruthy();
    expect(toast).not.toHaveBeenCalled();
    expect(toast.error).not.toHaveBeenCalled();
    const results = await act(async () => axe(document.body));
    expect(results.violations).toEqual([]);
  });

  it('CA-14: «Abrir el editor de nuevo» lleva al editor del archivo y retira el aviso', async () => {
    const channel = new FakeRealtimeChannel();
    renderListener(channel);
    failSession(channel);

    await userEvent.click(screen.getByRole('button', { name: 'Abrir el editor de nuevo' }));

    expect(push).toHaveBeenCalledWith(`/editor/${FILE_ID}`);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('«Cerrar aviso» lo retira', async () => {
    const channel = new FakeRealtimeChannel();
    renderListener(channel);
    failSession(channel);

    await userEvent.click(screen.getByRole('button', { name: 'Cerrar aviso' }));

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('un aviso por sesión fallida: el mismo dos veces se muestra una vez', () => {
    const channel = new FakeRealtimeChannel();
    renderListener(channel);

    failSession(channel);
    failSession(channel);
    failSession(channel, OTHER_SESSION);

    expect(screen.getAllByRole('alert')).toHaveLength(2);
  });

  it('RN-9: un aviso fuera del contrato se ignora', () => {
    const channel = new FakeRealtimeChannel();
    renderListener(channel);

    act(() =>
      channel.emit(EDITING_EVENTS.SAVE_FAILED, {
        sessionId: SESSION_ID,
        fileId: FILE_ID,
        fileName: 'informe.docx',
      }),
    );

    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('al desmontar deja de escuchar el canal', () => {
    const channel = new FakeRealtimeChannel();
    const view = render(
      <RealtimeContext.Provider value={channel}>
        <SaveFailedListener />
      </RealtimeContext.Provider>,
    );

    view.unmount();

    expect(channel.subscribers(EDITING_EVENTS.SAVE_FAILED)).toBe(0);
    expect(within(document.body).queryByRole('alert')).toBeNull();
  });
});
