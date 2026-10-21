import type { IdentityLogger } from './identity-logger';

/**
 * Por qué se revocaron todas las sesiones de una cuenta salvo, quizá, la actual, en las revocaciones que se registran
 * después de un commit: cambio o restablecimiento de contraseña y suspensión (plan 002 §7, 011 CA-2). El cierre de sesión
 * y «cerrar las demás» usan `Revocation.reason` de `session.service.ts`.
 */
export type MassRevocationReason = 'password_reset' | 'password_change' | 'account_suspended';

/** Una revocación en masa ya confirmada: la cuenta, el motivo y cuántas sesiones cerró. */
export interface MassRevocation {
  readonly userId: string;
  readonly reason: MassRevocationReason;
  readonly count: number;
}

/**
 * `identity.session.revoked` de una revocación en masa, **después** del commit del llamador; sin sesiones revocadas no
 * hay línea. Solo ids y el conteo (RNF-17).
 */
export const logMassRevocation = (
  logger: Pick<IdentityLogger, 'info'>,
  revocation: MassRevocation,
): void => {
  if (revocation.count > 0) {
    logger.info({ event: 'identity.session.revoked', ...revocation });
  }
};
