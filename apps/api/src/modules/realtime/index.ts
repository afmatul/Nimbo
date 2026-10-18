// API pública del módulo `realtime`. Otros módulos importan solo desde aquí (Art. VIII.3).
export { RealtimeModule } from './realtime.module';
export type { AccessTokenVerifierModule, RealtimeEnv } from './realtime.module';
export { configureRealtime } from './realtime-app';
export { I_REALTIME_PUBLISHER } from './application/ports/i-realtime-publisher.port';
export type {
  IRealtimePublisher,
  RealtimeNotice,
} from './application/ports/i-realtime-publisher.port';
export {
  I_DOCUMENT_ROOMS,
  REALTIME_DOCUMENT_LEFT,
} from './application/ports/i-document-rooms.port';
export type { DocumentLeftEvent, IDocumentRooms } from './application/ports/i-document-rooms.port';
