'use client';

import type * as React from 'react';

import { useSessionSharingApi } from '../hooks/use-session-sharing-api';

import { ReceivedSharesView } from './received-shares-view';

/** «Compartidos conmigo» conectada a la API con la sesión en memoria (002). */
export function SessionReceivedSharesView({
  apiPublicUrl,
}: {
  readonly apiPublicUrl: string;
}): React.JSX.Element {
  return <ReceivedSharesView api={useSessionSharingApi(apiPublicUrl)} />;
}
