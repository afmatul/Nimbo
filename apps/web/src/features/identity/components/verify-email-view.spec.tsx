/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { StrictMode } from 'react';

import { saveChosenPlan } from '../chosen-plan-storage';

import { VerifyEmailView } from './verify-email-view';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

function errorResponse(code: string): Response {
  return jsonResponse({ code, message: 'No', correlationId: 'corr-v' }, 400);
}

describe('VerifyEmailView', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.localStorage.clear();
    window.history.replaceState(null, '', '/verificar-correo');
  });

  it('muestra verificando y luego el éxito con Iniciar sesión', async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    window.history.replaceState(null, '', '/verificar-correo#token=ok');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    expect(screen.getByRole('status').textContent).toContain('Verificando');
    resolveFetch(jsonResponse({ status: 'verified' }));

    expect(
      await screen.findByRole('heading', { name: '¡Listo! Tu correo está verificado.' }),
    ).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Iniciar sesión' }).getAttribute('href')).toBe(
      '/iniciar-sesion',
    );
    expect(screen.queryByText(/Tu cuenta empieza en el plan Personal/)).toBeNull();
  });

  it('con un plan vigente muestra el mensaje de CA-28', async () => {
    saveChosenPlan(window.localStorage, { planId: 'pro', planName: 'Profesional' }, new Date());
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));
    window.history.replaceState(null, '', '/verificar-correo#token=plan');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    expect(
      await screen.findByText(/Podrás activar Profesional desde Plan y facturación/),
    ).toBeTruthy();
    expect(document.querySelector('[data-state="plan-de-pago-elegido"]')).toBeTruthy();
  });

  it('ya verificado no usa un error rojo', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'already-verified' }));
    window.history.replaceState(null, '', '/verificar-correo#token=usado');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    expect(await screen.findByText('Tu correo ya está verificado. Inicia sesión.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it.each([
    ['enlace-expirado', 'IDENTITY_VERIFICATION_LINK_EXPIRED', 'Este enlace venció'],
    ['enlace-invalido', 'IDENTITY_VERIFICATION_LINK_INVALID', 'Este enlace no es válido'],
  ])('%s ofrece pedir un enlace nuevo', async (state, code, message) => {
    fetchMock.mockResolvedValue(errorResponse(code));
    window.history.replaceState(null, '', `/verificar-correo#token=${state}`);
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    expect(await screen.findByText(new RegExp(message))).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' }).getAttribute('href')).toBe(
      '/registro/pedir-enlace',
    );
    expect(document.querySelector(`[data-state="${state}"]`)).toBeTruthy();
  });

  it('sin fragmento, y al recargar, muestra enlace-invalido', async () => {
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);
    expect(await screen.findByText(/Este enlace no es válido/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));
    window.history.replaceState(null, '', '/verificar-correo#token=reload');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);
    expect(
      await screen.findByRole('heading', { name: '¡Listo! Tu correo está verificado.' }),
    ).toBeTruthy();
    expect(window.location.hash).toBe('');

    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);
    expect((await screen.findAllByText(/Este enlace no es válido/)).length).toBeGreaterThan(0);
  });

  it('hace un solo POST en StrictMode y no sale de API_PUBLIC_URL', async () => {
    window.history.replaceState(null, '', '/verificar-correo#token=strict');
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));
    render(
      <StrictMode>
        <VerifyEmailView apiPublicUrl="http://localhost/api/v1" />
      </StrictMode>,
    );
    await screen.findByRole('heading', { name: '¡Listo! Tu correo está verificado.' });
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
    expect(
      fetchMock.mock.calls.every((call) => String(call[0]).startsWith('http://localhost/api/v1')),
    ).toBe(true);
  });

  it('no tiene violaciones graves de accesibilidad', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));
    window.history.replaceState(null, '', '/verificar-correo#token=a11y');
    const view = render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);
    expect(
      await screen.findByRole('heading', { name: '¡Listo! Tu correo está verificado.' }),
    ).toBeTruthy();
    const results = await axe(view.container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
});
