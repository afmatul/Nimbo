'use client';

import { EMAIL_REQUEST_COOLDOWN_SECONDS, IDENTITY_ERROR_CODES } from '@nimbo/contracts';
import { useState, type JSX } from 'react';

import { Alert } from '../../../components/ui/alert';
import { Button } from '../../../components/ui/button';
import { toApiClientError, type ApiClientError } from '../../../lib/api-error';
import { messageForCode } from '../../../lib/error-catalog';
import { resendVerification } from '../api';
import { useCountdown } from '../hooks/use-countdown';

import { ServerErrorAlert } from './server-error-alert';

interface Round {
  readonly id: number;
  readonly seconds: number;
  readonly limited: boolean;
}

function announcement(remaining: number): string {
  return remaining > 0
    ? `Podrás reenviar el enlace en ${String(remaining)} segundos.`
    : 'Ya puedes reenviar el enlace.';
}

function CooldownControl({
  seconds,
  onResend,
}: {
  readonly seconds: number;
  readonly onResend: () => Promise<void>;
}): JSX.Element {
  const remaining = useCountdown(seconds);
  const [sending, setSending] = useState(false);

  const send = (): void => {
    if (remaining > 0 || sending) return;
    setSending(true);
    void onResend().finally(() => {
      setSending(false);
    });
  };

  return (
    <div className="space-y-2">
      <p aria-live="polite" className="text-sm text-muted-foreground">
        {announcement(remaining)}
      </p>
      <Button type="button" variant="outline" disabled={remaining > 0 || sending} onClick={send}>
        Reenviar enlace
      </Button>
    </div>
  );
}

/** «Reenviar enlace»: `EMAIL_REQUEST_COOLDOWN_SECONDS` al empezar; un 429 usa los segundos de `Retry-After`. */
export function ResendLinkButton({
  apiPublicUrl,
  email,
}: {
  readonly apiPublicUrl: string;
  readonly email: string;
}): JSX.Element {
  const [round, setRound] = useState<Round>({
    id: 0,
    seconds: EMAIL_REQUEST_COOLDOWN_SECONDS,
    limited: false,
  });
  const [limitMessage, setLimitMessage] = useState<string | null>(null);
  const [serverError, setServerError] = useState<ApiClientError | null>(null);

  const onResend = async (): Promise<void> => {
    setServerError(null);
    try {
      await resendVerification(apiPublicUrl, { email });
      setLimitMessage(null);
      setRound((current) => ({
        id: current.id + 1,
        seconds: EMAIL_REQUEST_COOLDOWN_SECONDS,
        limited: false,
      }));
    } catch (caught) {
      const error = toApiClientError(caught);
      if (error.code !== IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS) {
        setServerError(error);
        return;
      }
      const seconds = error.retryAfterSeconds ?? EMAIL_REQUEST_COOLDOWN_SECONDS;
      setLimitMessage(
        messageForCode(error.code, {
          correlationId: error.correlationId,
          retryAfterSeconds: seconds,
        }),
      );
      setRound((current) => ({ id: current.id + 1, seconds, limited: true }));
    }
  };

  return (
    <div className="space-y-3" data-state={round.limited ? 'limite-reenvio' : undefined}>
      {limitMessage !== null ? <Alert>{limitMessage}</Alert> : null}
      {serverError !== null ? <ServerErrorAlert error={serverError} /> : null}
      <CooldownControl key={round.id} seconds={round.seconds} onResend={onResend} />
    </div>
  );
}
