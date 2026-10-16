import { EventEmitter } from 'node:events';

import { SHARED_ERROR_CODES } from '@nimbo/contracts';

import { FixedClock, Role } from '../../../shared';

import { ConnectionLifetime, SESSION_EXPIRED_EVENT } from './connection-lifetime';
import type { RealtimeSocket } from './realtime-socket';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const REMAINING_MS = 5_000;
const ONE_MS = 1;

/** Conexión simulada: oyentes reales de `disconnect` y espías para `emit` y `disconnect`. */
class FakeSocket extends EventEmitter {
  readonly sent: unknown[][] = [];
  readonly data;
  readonly disconnect = jest.fn(() => {
    super.emit('disconnect', 'server namespace disconnect');
    return this;
  });

  constructor(expiresAt: Date) {
    super();
    this.data = {
      correlationId: 'c0rre1a7-0000-4000-8000-000000000000',
      actor: { id: 'user-a', role: Role.CLIENT },
      expiresAt,
    };
  }

  override emit(event: string, ...args: unknown[]): boolean {
    this.sent.push([event, ...args]);
    return true;
  }

  closeFromClient(): void {
    super.emit('disconnect', 'client namespace disconnect');
  }
}

const socketExpiringIn = (milliseconds: number): FakeSocket =>
  new FakeSocket(new Date(NOW.getTime() + milliseconds));

const asRealtimeSocket = (socket: FakeSocket): RealtimeSocket =>
  socket as unknown as RealtimeSocket;

describe('ConnectionLifetime (015 T-04)', () => {
  let lifetime: ConnectionLifetime;

  beforeEach(() => {
    jest.useFakeTimers();
    lifetime = new ConnectionLifetime(new FixedClock(NOW));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('CA-4: no cierra antes de que venza el token', () => {
    const socket = socketExpiringIn(REMAINING_MS);

    lifetime.watch(asRealtimeSocket(socket));
    jest.advanceTimersByTime(REMAINING_MS - ONE_MS);

    expect(socket.sent).toEqual([]);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });

  it('CA-4: al vencer el token avisa `realtime.session-expired` con SHARED_UNAUTHENTICATED y desconecta', () => {
    const socket = socketExpiringIn(REMAINING_MS);

    lifetime.watch(asRealtimeSocket(socket));
    jest.advanceTimersByTime(REMAINING_MS);

    expect(SESSION_EXPIRED_EVENT).toBe('realtime.session-expired');
    expect(socket.sent).toEqual([
      [SESSION_EXPIRED_EVENT, { code: SHARED_ERROR_CODES.UNAUTHENTICATED }],
    ]);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('CA-4: si la conexión se cierra antes, cancela el temporizador y no avisa (sin fugas)', () => {
    const socket = socketExpiringIn(REMAINING_MS);

    lifetime.watch(asRealtimeSocket(socket));
    socket.closeFromClient();

    expect(jest.getTimerCount()).toBe(0);
    jest.advanceTimersByTime(REMAINING_MS);
    expect(socket.sent).toEqual([]);
    expect(socket.disconnect).not.toHaveBeenCalled();
  });
});
