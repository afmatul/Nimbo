'use client';

import { CheckCircle2 } from 'lucide-react';
import type * as React from 'react';

import { ConfirmDestructiveDialog } from '../../../components/nimbo/confirm-destructive-dialog';
import { Alert } from '../../../components/ui/alert';
import type { SessionsConfirmation, SessionsNotice } from '../hooks/use-sessions-card';

import { ServerErrorAlert } from './server-error-alert';
import { deviceLabel } from './session-row';

interface ConfirmationTexts {
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
}

const CLOSE_SESSION_LABEL = 'Cerrar sesión';

function sessionsCount(count: number): string {
  return count === 1 ? '1 sesión' : `${String(count)} sesiones`;
}

/** Textos de §11 de la spec para cada confirmación (CA-12, CA-13, CA-14). */
function confirmationTexts(confirmation: SessionsConfirmation): ConfirmationTexts {
  if (confirmation.kind === 'others') {
    const devices =
      confirmation.count === 1 ? 'Ese dispositivo tendrá' : 'Esos dispositivos tendrán';
    return {
      title: '¿Cerrar las demás sesiones?',
      description: `Cerraremos ${sessionsCount(confirmation.count)}. ${devices} que iniciar sesión de nuevo; la de este dispositivo seguirá abierta.`,
      confirmLabel: `Cerrar ${sessionsCount(confirmation.count)}`,
    };
  }
  if (confirmation.session.current) {
    return {
      title: '¿Cerrar la sesión en este dispositivo?',
      description: 'Tendrás que iniciar sesión de nuevo para volver a entrar.',
      confirmLabel: CLOSE_SESSION_LABEL,
    };
  }
  return {
    title: `¿Cerrar la sesión en ${deviceLabel(confirmation.session)}?`,
    description: 'Ese dispositivo tendrá que iniciar sesión de nuevo.',
    confirmLabel: CLOSE_SESSION_LABEL,
  };
}

export interface SessionsConfirmDialogProps {
  readonly confirmation: SessionsConfirmation | null;
  readonly pending: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

/** Confirmación de cerrar una sesión, la actual o las demás. Mientras no hay nada que confirmar, queda cerrado. */
export function SessionsConfirmDialog({
  confirmation,
  pending,
  onCancel,
  onConfirm,
}: SessionsConfirmDialogProps): React.JSX.Element | null {
  if (confirmation === null) return null;
  return (
    <ConfirmDestructiveDialog
      open
      onOpenChange={(open) => !open && onCancel()}
      pending={pending}
      onConfirm={onConfirm}
      {...confirmationTexts(confirmation)}
    />
  );
}

function successMessage(notice: Exclude<SessionsNotice, { kind: 'failed' }>): string {
  if (notice.kind === 'revoked') return `Cerramos la sesión en ${deviceLabel(notice.session)}.`;
  return `Cerramos ${sessionsCount(notice.count)}. Solo queda abierta la de este dispositivo.`;
}

/** Resultado dentro de la tarjeta: éxito con `role="status"`; error con `role="alert"` y el texto del catálogo. */
export function SessionsNoticeAlert({
  notice,
}: {
  readonly notice: SessionsNotice | null;
}): React.JSX.Element | null {
  if (notice === null) return null;
  if (notice.kind === 'failed') return <ServerErrorAlert error={notice.error} />;
  return (
    <Alert variant="success" className="flex items-start gap-2">
      <CheckCircle2
        aria-hidden="true"
        className="mt-0.5 h-4 w-4 shrink-0 text-success-foreground"
      />
      <p>{successMessage(notice)}</p>
    </Alert>
  );
}
