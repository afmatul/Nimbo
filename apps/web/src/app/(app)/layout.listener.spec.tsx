import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import AppGroupLayout from './layout';

jest.mock('../../features/identity/session/session-gate', () => ({
  SessionGate: ({ children }: { readonly children: ReactNode }) => <>{children}</>,
}));
jest.mock('../../features/realtime/realtime-provider', () => ({
  RealtimeProvider: ({ children }: { readonly children: ReactNode }) => (
    <div data-canal="en-vivo">{children}</div>
  ),
}));
jest.mock('../../features/editing/components/save-failed-listener', () => ({
  SaveFailedListener: () => <p>Oyente de guardado fallido</p>,
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ replace: jest.fn() }) }));

describe('layout del grupo (app): oyente de guardado fallido (016 CA-14)', () => {
  beforeEach(() => {
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://localhost:3000';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('CA-14: el oyente vive junto al canal en vivo, arriba del contenido de cualquier pantalla', () => {
    const markup = renderToStaticMarkup(
      <AppGroupLayout>
        <p>Contenido de la pantalla</p>
      </AppGroupLayout>,
    );

    const channel = markup.indexOf('data-canal="en-vivo"');
    const listener = markup.indexOf('Oyente de guardado fallido');
    expect(channel).toBeGreaterThanOrEqual(0);
    expect(listener).toBeGreaterThan(channel);
    expect(markup.indexOf('Contenido de la pantalla')).toBeGreaterThan(listener);
  });
});
