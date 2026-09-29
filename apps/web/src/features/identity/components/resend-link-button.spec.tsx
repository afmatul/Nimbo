/**
 * @jest-environment jsdom
 */
import { act, fireEvent, render, screen } from '@testing-library/react';

import { ResendLinkButton } from './resend-link-button';

function jsonResponse(
  body: unknown,
  status: number,
  headers: Readonly<Record<string, string>> = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as Response;
}

describe('ResendLinkButton', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('empieza deshabilitado 60 s y anuncia la cuenta regresiva', () => {
    render(<ResendLinkButton apiPublicUrl="http://localhost/api/v1" email="ana@ejemplo.com" />);

    expect(
      (screen.getByRole('button', { name: 'Reenviar enlace' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(screen.getByText('Podrás reenviar el enlace en 60 segundos.')).toBeTruthy();
  });

  it('al pulsar, cuando ya puede, reinicia la cuenta de 60 s', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    render(<ResendLinkButton apiPublicUrl="http://localhost/api/v1" email="ana@ejemplo.com" />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });

    const button = screen.getByRole('button', { name: 'Reenviar enlace' });
    expect((button as HTMLButtonElement).disabled).toBe(false);

    await act(async () => {
      fireEvent.click(button);
    });

    expect(screen.getByText('Podrás reenviar el enlace en 60 segundos.')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Reenviar enlace' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      'http://localhost/api/v1/auth/resend-verification',
    );
  });

  it('un 429 pasa a limite-reenvio con el mensaje y la cuenta de Retry-After', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: 'IDENTITY_TOO_MANY_REQUESTS',
          message: 'Límite',
          correlationId: 'corr-429',
        },
        429,
        { 'retry-after': '120' },
      ),
    );
    render(<ResendLinkButton apiPublicUrl="http://localhost/api/v1" email="ana@ejemplo.com" />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace' }));
    });

    expect(document.querySelector('[data-state="limite-reenvio"]')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toContain('2 minutos');
    expect(screen.getByText('Podrás reenviar el enlace en 120 segundos.')).toBeTruthy();
  });

  it.each([
    [
      'un 500',
      () =>
        Promise.resolve(
          jsonResponse(
            { code: 'INTERNAL_ERROR', message: 'Falla', correlationId: 'corr-500' },
            500,
          ),
        ),
    ],
    ['la red caída', () => Promise.reject(new TypeError('Failed to fetch'))],
  ])('%s muestra error-servidor y deja reintentar', async (_caso, respond) => {
    fetchMock.mockImplementationOnce(respond);
    render(<ResendLinkButton apiPublicUrl="http://localhost/api/v1" email="ana@ejemplo.com" />);

    act(() => {
      jest.advanceTimersByTime(60_000);
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Reenviar enlace' }));
    });

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('comparte este código con soporte');
    expect(document.querySelector('[data-state="error-servidor"]')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Reenviar enlace' }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });
});
