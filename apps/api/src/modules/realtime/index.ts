// API pública del módulo `realtime`. Otros módulos importan solo desde aquí (Art. VIII.3).
export { RealtimeModule } from './realtime.module';
export type { AccessTokenVerifierModule, RealtimeEnv } from './realtime.module';
export { configureRealtime } from './realtime-app';
