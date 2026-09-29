// API pública del módulo `access`. Otros módulos importan solo desde aquí (Art. VIII.3, CA-5; plan 003 §5).
export { AccessModule } from './access.module';
export { PermissionResolver } from './application/permission-resolver';
export { AccessLevel } from './domain/access-level.enum';
export { Action } from './domain/action.enum';
export { accessibleNodes } from './infrastructure/sql/accessible-nodes';
export type { AccessibleNodesFragment } from './infrastructure/sql/accessible-nodes';
