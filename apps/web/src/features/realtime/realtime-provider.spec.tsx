/**
 * @jest-environment jsdom
 */
import {
  REALTIME_ERROR_CODES,
  REALTIME_EVENTS,
  REALTIME_PATH,
  type RoleName,
} from '@nimbo/contracts';
import { act, render, screen } from '@testing-library/react';
import { useEffect, type JSX } from 'react';
import { io } from 'socket.io-client';

import { useSession, type SessionContextValue } from '../identity/session/session-provider';

import { RealtimeProvider } from './realtime-provider';
import { useRealtime } from './use-realtime';

jest.mock('socket.io-client', () => ({ io: jest.fn() }));
jest.mock('../identity/session/session-provider', () => ({ useSession: jest.fn() }));

type Handler = (...args: unknown[]) => void;
type AuthCallback = (send: (data: object) => void) => void;

/** Doble del `Socket` de `socket.io-client`: guarda los manejadores para dispararlos desde la prueba. */
class FakeSocket {
  id: string | undefined = undefined;
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
const MS_PER_SECOND = 1_000;
const RETRY_AFTER_SECONDS = 7;
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

/** Consumidor de `useRealtime()`: muestra el id de conexión y se suscribe a `evento.prueba` mientras está montado. */
function ChannelProbe({ onEvent }: { readonly onEvent: (payload: unknown) => void }): JSX.Element {
  const channel = useRealtime();
  useEffect(() => channel.on('evento.prueba', onEvent), [channel, onEvent]);
  return <p>{`conexión: ${channel.connectionId ?? 'ninguna'}`}</p>;
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

function tooManyRequestsError(retryAfterSeconds?: number): Error & { data: unknown } {
  const retry = retryAfterSeconds === undefined ? {} : { retryAfterSeconds };
  return Object.assign(new Error(REALTIME_ERROR_CODES.TOO_MANY_REQUESTS), {
    data: { code: REALTIME_ERROR_CODES.TOO_MANY_REQUESTS, status: 429, ...retry },
  });
}

function rerenderWithToken(rerender: ReturnType<typeof render>['rerender'], token: string): void {
  useSessionMock.mockReturnValue(sessionWith(token));
  rerender(
    <RealtimeProvider apiPublicUrl={API_PUBLIC_URL}>
      <p>Contenido</p>
    </RealtimeProvider>,
  );
}

async function flushRenewal(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe('RealtimeProvider', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

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
    expect(openOptions()['path']).toBe(REALTIME_PATH);
    expect(nextHandshakeAuth()).toEqual({ token: 'token-inicial' });
  });

  it('CA-11: cada intento de reconexión lee el token vigente de la sesión, sin desactivar la reconexión automática', () => {
    const { rerender } = renderProvider();

    rerenderWithToken(rerender, 'token-renovado-por-la-sesion');

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

    socket.fire(REALTIME_EVENTS.SESSION_EXPIRED, { code: 'SHARED_UNAUTHENTICATED' });
    await flushRenewal();

    expect(renew).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(nextHandshakeAuth()).toEqual({ token: 'token-nuevo' });
  });

  it('un rechazo por otro motivo (rol, red) no renueva la sesión ni reabre', async () => {
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

  it('CA-4: si la sesión ya renovó el token, ante `realtime.session-expired` reabre con él sin renovar otra vez', async () => {
    const { rerender } = renderProvider();
    rerenderWithToken(rerender, 'token-renovado-por-la-sesion');

    socket.fire(REALTIME_EVENTS.SESSION_EXPIRED, { code: 'SHARED_UNAUTHENTICATED' });
    await flushRenewal();

    expect(renew).not.toHaveBeenCalled();
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(nextHandshakeAuth()).toEqual({ token: 'token-renovado-por-la-sesion' });
  });

  it('CA-4: si el token recién renovado también se rechaza, no vuelve a renovar ni reabre hasta conectar', async () => {
    renderProvider();
    socket.fire('connect_error', unauthenticatedError());
    await flushRenewal();
    nextHandshakeAuth();

    socket.fire('connect_error', unauthenticatedError());
    await flushRenewal();

    expect(renew).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
  });

  it('CA-4: tras conectar con el token renovado, un nuevo vencimiento vuelve a renovar', async () => {
    renderProvider();
    socket.fire('connect_error', unauthenticatedError());
    await flushRenewal();
    nextHandshakeAuth();
    socket.fire('connect');

    socket.fire(REALTIME_EVENTS.SESSION_EXPIRED, { code: 'SHARED_UNAUTHENTICATED' });
    await flushRenewal();

    expect(renew).toHaveBeenCalledTimes(2);
    expect(socket.connect).toHaveBeenCalledTimes(2);
  });

  it('CA-4: si la sesión trae otro token, reabre con él aunque el canal ya haya renovado', async () => {
    const { rerender } = renderProvider();
    socket.fire('connect_error', unauthenticatedError());
    await flushRenewal();
    nextHandshakeAuth();
    rerenderWithToken(rerender, 'token-renovado-por-la-sesion');

    socket.fire('connect_error', unauthenticatedError());
    await flushRenewal();

    expect(renew).toHaveBeenCalledTimes(1);
    expect(socket.connect).toHaveBeenCalledTimes(2);
    expect(nextHandshakeAuth()).toEqual({ token: 'token-renovado-por-la-sesion' });
  });

  it('CA-14: ante REALTIME_TOO_MANY_REQUESTS reabre el canal tras la espera indicada, sin renovar la sesión', () => {
    jest.useFakeTimers();
    renderProvider();

    socket.fire('connect_error', tooManyRequestsError(RETRY_AFTER_SECONDS));
    jest.advanceTimersByTime(RETRY_AFTER_SECONDS * MS_PER_SECOND - 1);
    expect(socket.connect).not.toHaveBeenCalled();

    jest.advanceTimersByTime(1);
    expect(socket.connect).toHaveBeenCalledTimes(1);
    expect(renew).not.toHaveBeenCalled();
  });

  it.each([
    ['ausente', undefined],
    ['NaN', Number.NaN],
    ['negativa', -RETRY_AFTER_SECONDS],
    ['cero', 0],
  ])('CA-14: si la espera del rechazo es %s, no reabre el canal', (_caso, retryAfterSeconds) => {
    jest.useFakeTimers();
    renderProvider();

    socket.fire('connect_error', tooManyRequestsError(retryAfterSeconds));
    jest.runAllTimers();

    expect(socket.connect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('CA-14: al desmontar durante la espera cancela el reintento', () => {
    jest.useFakeTimers();
    const { unmount } = renderProvider();
    socket.fire('connect_error', tooManyRequestsError(RETRY_AFTER_SECONDS));

    unmount();
    jest.advanceTimersByTime(RETRY_AFTER_SECONDS * MS_PER_SECOND);

    expect(socket.connect).not.toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);
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

  it('al desmontar cierra el canal y, aunque la renovación termine después, no escribe el token ni lo reabre', async () => {
    const { unmount } = renderProvider();
    socket.fire('connect_error', unauthenticatedError());

    unmount();
    await flushRenewal();

    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(socket.connect).not.toHaveBeenCalled();
    expect(nextHandshakeAuth()).toEqual({ token: 'token-inicial' });
  });

  describe('useRealtime() (016)', () => {
    it('CA-6: expone el id de la conexión vigente y lo cambia al reconectar', () => {
      render(
        <RealtimeProvider apiPublicUrl={API_PUBLIC_URL}>
          <ChannelProbe onEvent={jest.fn()} />
        </RealtimeProvider>,
      );
      expect(screen.getByText('conexión: ninguna')).toBeTruthy();

      socket.id = 'conexion-1';
      act(() => socket.fire('connect'));
      expect(screen.getByText('conexión: conexion-1')).toBeTruthy();

      act(() => socket.fire('disconnect'));
      expect(screen.getByText('conexión: ninguna')).toBeTruthy();
    });

    it('CA-6: entrega los avisos del canal al suscriptor y lo da de baja al desmontar', () => {
      const onEvent = jest.fn();
      const { unmount } = render(
        <RealtimeProvider apiPublicUrl={API_PUBLIC_URL}>
          <ChannelProbe onEvent={onEvent} />
        </RealtimeProvider>,
      );

      socket.fire('evento.prueba', { participants: [] });
      unmount();

      expect(onEvent).toHaveBeenCalledWith({ participants: [] });
      expect(socket.off).toHaveBeenCalledWith('evento.prueba', onEvent);
    });

    it('fuera del proveedor, o para un rol interno, no hay conexión ni avisos', () => {
      useSessionMock.mockReturnValue(sessionWith('token-inicial', 'SUPPORT'));
      render(
        <RealtimeProvider apiPublicUrl={API_PUBLIC_URL}>
          <ChannelProbe onEvent={jest.fn()} />
        </RealtimeProvider>,
      );
      render(<ChannelProbe onEvent={jest.fn()} />);

      expect(screen.getAllByText('conexión: ninguna')).toHaveLength(2);
    });
  });
});
