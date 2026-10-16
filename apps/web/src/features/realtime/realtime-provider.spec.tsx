/**
 * @jest-environment jsdom
 */
import type { RoleName } from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import { io } from 'socket.io-client';

import { useSession, type SessionContextValue } from '../identity/session/session-provider';

import { RealtimeProvider } from './realtime-provider';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('../identity/session/session-provider', () => ({ useSession: jest.fn() }));

type Handler = (...args: unknown[]) => void;
type AuthCallback = (send: (data: object) => void) => void;

/** Doble del `Socket` de `socket.io-client`: guarda los manejadores para dispararlos desde la prueba. */
class FakeSocket {
  readonly handlers = new Map<string, Handler>();
  readonly connect = jest.fn(() => this);
  readonly disconnect = jest.fn(() => this);
  readonly off = jest.fn(() => this);

  on(event: string, handler: Handler): this {
    this.handlers.set(event, handler);
    return this;
  }

  fire(event: string, ...args: unknown[]): void {
    this.handlers.get(event)?.(...args);
  }
}

const API_PUBLIC_URL = 'http://localhost/api/v1';
const ioMock = jest.mocked(io);
const useSessionMock = jest.mocked(useSession);

let socket: FakeSocket;
let renew: jest.Mock<Promise<string | null>, []>;

function sessionWith(token: string, role: RoleName = 'CLIENT'): SessionContextValue {
  return {
    status: 'authenticated',
    user: { id: 'u-1', fullName: 'Ana López', email: 'ana@ejemplo.com', role },
    accessToken: token,
    renew,
    signOut: jest.fn(),
  };
}

function renderProvider(): ReturnType<typeof render> {
  return render(
    <RealtimeProvider apiPublicUrl={API_PUBLIC_URL}>
      <p>Contenido</p>
    </RealtimeProvider>,
  );
}

function openOptions(): Record<string, unknown> {
  const [, options] = ioMock.mock.calls[0] ?? [];
  return (options ?? {}) as Record<string, unknown>;
}

/** Lo que el cliente mandaría como `handshake.auth` en el próximo intento. */
function nextHandshakeAuth(): object {
  let sent: object = {};
  (openOptions()['auth'] as AuthCallback)((data) => {
    sent = data;
  });
  return sent;
}

function unauthenticatedError(): Error & { data: unknown } {
  return Object.assign(new Error('SHARED_UNAUTHENTICATED'), {
    data: { code: 'SHARED_UNAUTHENTICATED', status: 401 },
  });
}

async function flushRenewal(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('RealtimeProvider', () => {
  beforeEach(() => {
    socket = new FakeSocket();
    ioMock.mockReturnValue(socket as never);
    renew = jest.fn<Promise<string | null>, []>().mockResolvedValue('token-nuevo');
    useSessionMock.mockReturnValue(sessionWith('token-inicial'));
  });

  it('muestra a sus hijos sin interfaz propia', () => {
    renderProvider();

    expect(screen.getByText('Contenido')).toBeTruthy();
  });

  it('CA-4: abre el canal en el origen de la API, con la ruta fija y el token en `auth`, nunca en la URL', () => {
    renderProvider();

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock.mock.calls[0]?.[0]).toBe('http://localhost');
    expect(openOptions()['path']).toBe('/socket.io');
    expect(nextHandshakeAuth()).toEqual({ token: 'token-inicial' });
  });

  it('CA-11: cada intento de reconexión lee el token vigente de la sesión, sin desactivar la reconexión automática', () => {
    const { rerender } = renderProvider();

    useSessionMock.mockReturnValue(sessionWith('token-renovado-por-la-sesion'));
    rerender(
      <RealtimeProvider apiPublicUrl={API_PUBLIC_URL}>
        <p>Contenido</p>
      </RealtimeProvider>,
    );

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(openOptions()['reconnection']).not.toBe(false);
    expect(nextHandshakeAuth()).toEqual({ token: 'token-renovado-por-la-sesion' });
  });

  it('CA-4: ante `connect_error` con SHARED_UNAUTHENTICATED renueva la sesión y reabre con el token nuevo', async () => {
    renderProvider();

    socket.fire('connect_error', unauthenticatedError());
    await flushRenewal();

    expect(renew).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(nextHandshakeAuth()).toEqual({ token: 'token-nuevo' });
  });

  it('CA-4: ante `realtime.session-expired` renueva la sesión y reabre con el token nuevo', async () => {
    renderProvider();

    socket.fire('realtime.session-expired', { code: 'SHARED_UNAUTHENTICATED' });
    await flushRenewal();

    expect(renew).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(nextHandshakeAuth()).toEqual({ token: 'token-nuevo' });
  });

  it('un rechazo por otro motivo (rol, límite de intentos) no renueva la sesión', async () => {
    renderProvider();

    socket.fire(
      'connect_error',
      Object.assign(new Error('x'), { data: { code: 'SHARED_FORBIDDEN' } }),
    );
    socket.fire('connect_error', new Error('xhr poll error'));
    await flushRenewal();

    expect(renew).not.toHaveBeenCalled();
    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('si la sesión ya no se puede renovar, no reabre el canal', async () => {
    renew.mockResolvedValue(null);
    renderProvider();

    socket.fire('connect_error', unauthenticatedError());
    await flushRenewal();

    expect(socket.connect).not.toHaveBeenCalled();
  });

  it('un rol interno no abre el canal', () => {
    useSessionMock.mockReturnValue(sessionWith('token-inicial', 'SUPPORT'));

    renderProvider();

    expect(ioMock).not.toHaveBeenCalled();
  });

  it('al desmontar cierra el canal y no lo reabre aunque la renovación termine después', async () => {
    const { unmount } = renderProvider();
    socket.fire('connect_error', unauthenticatedError());

    unmount();
    await flushRenewal();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).not.toHaveBeenCalled();
  });
});
