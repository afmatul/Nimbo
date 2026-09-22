import type { IClock } from './i-clock.port';

/** Reloj determinista para pruebas de dominio de cualquier módulo (sin `sleep`, conventions §Pruebas). */
export class FixedClock implements IClock {
  private currentMs: number;

  constructor(fixedAt: Date) {
    this.currentMs = fixedAt.getTime();
  }

  now(): Date {
    return new Date(this.currentMs);
  }

  advance(milliseconds: number): void {
    this.currentMs += milliseconds;
  }

  set(date: Date): void {
    this.currentMs = date.getTime();
  }
}
