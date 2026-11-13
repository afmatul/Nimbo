import type {
  OpenEditSessionResponse,
  Participant,
  ReadOnlyReason,
  SessionUser,
} from '@nimbo/contracts';

import type { RealtimeChannel, RealtimeHandler } from '../realtime/use-realtime';

export const FILE_ID = '7a8b9c0d-1e2f-4c5d-8e6f-2f0c1d2e3a4b';
export const SESSION_ID = '2f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

export const ME: SessionUser = {
  id: '0b7e6c1a-6f0e-4c1b-9d3a-2f5b8e9a1c4d',
  fullName: 'Lucía Barrios',
  email: 'lucia@ejemplo.com',
  role: 'CLIENT',
  pendingPlanSlug: null,
};

export const LUCIA: Participant = { userId: ME.id, displayName: ME.fullName };
export const MARIO: Participant = {
  userId: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  displayName: 'Mario Gómez',
};
export const JULIA: Participant = {
  userId: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
  displayName: 'Julia Cifuentes',
};
export const SOFIA: Participant = {
  userId: '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6a7b',
  displayName: 'Sofía Ramírez',
};
export const ANDRES: Participant = {
  userId: '4f5a6b7c-8d9e-4f0a-9b2c-3d4e5f6a7b8c',
  displayName: 'Andrés Pineda',
};

export const DOCUMENT_SERVER_URL = 'https://docs.nimbo.local';
export const EDITOR_CONFIG = {
  document: { key: SESSION_ID, title: 'Propuesta_comercial_2027.docx' },
  token: 'eyJ…',
};

/** Apertura en edición: la configuración firmada y la presencia (CA-1, CA-6). */
export function editingSession(
  participants: readonly Participant[] = [LUCIA, MARIO, JULIA],
  maxEditors = 5,
): OpenEditSessionResponse {
  return {
    sessionId: SESSION_ID,
    mode: 'edit',
    readOnlyReason: null,
    documentServerUrl: DOCUMENT_SERVER_URL,
    config: EDITOR_CONFIG,
    participants: [...participants],
    editors: participants.length,
    maxEditors,
    lastSaveFailed: false,
  };
}

/** Apertura en solo lectura con su motivo: sin sesión (plan §4). */
export function viewingSession(
  readOnlyReason: ReadOnlyReason,
  participants: readonly Participant[] = [],
  maxEditors = 5,
): OpenEditSessionResponse {
  return {
    ...editingSession(participants, maxEditors),
    sessionId: null,
    mode: 'view',
    readOnlyReason,
  };
}

/** Doble del canal en vivo: guarda las suscripciones para emitir avisos desde la prueba. */
export class FakeRealtimeChannel implements RealtimeChannel {
  private readonly handlers = new Map<string, Set<RealtimeHandler>>();

  constructor(readonly connectionId: string | null = 'conexion-1') {}

  readonly on = (event: string, handler: RealtimeHandler): (() => void) => {
    const subscribed = this.handlers.get(event) ?? new Set<RealtimeHandler>();
    subscribed.add(handler);
    this.handlers.set(event, subscribed);
    return () => void subscribed.delete(handler);
  };

  emit(event: string, payload: unknown): void {
    this.handlers.get(event)?.forEach((handler) => handler(payload));
  }

  subscribers(event: string): number {
    return this.handlers.get(event)?.size ?? 0;
  }
}
