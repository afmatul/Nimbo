/**
 * @jest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react';
import { axe } from 'jest-axe';
import { StrictMode } from 'react';

import { saveChosenPlan } from '../chosen-plan-storage';
import { forgetSession, recallSession } from '../session/session-memory';
import { sessionFixture } from '../session/test-session';

import { VerifyEmailView } from './verify-email-view';

const replace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
}));

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

  describe('con la sesión que abre la verificación (002 CA-15)', () => {
    function verifiedWithSession(): Response {
      return jsonResponse({ status: 'verified', session: sessionFixture({ token: 'del-enlace' }) });
    }

    beforeEach(() => {
      replace.mockReset();
      forgetSession();
    });

    it('001 D-20: deja la sesión en memoria y entra directo a Mis archivos sin pedir iniciar sesión', async () => {
      fetchMock.mockResolvedValue(verifiedWithSession());
      window.history.replaceState(null, '', '/verificar-correo#token=con-sesion');
      render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

      expect(await screen.findByText('Entrando a tus archivos…')).toBeTruthy();
      expect(screen.queryByRole('link', { name: 'Iniciar sesión' })).toBeNull();
      await waitFor(() => expect(replace).toHaveBeenCalledWith('/archivos'));
      expect(recallSession(Date.now())?.accessToken).toBe('del-enlace');
    });

    it('entra una sola vez también en StrictMode', async () => {
      fetchMock.mockResolvedValue(verifiedWithSession());
      window.history.replaceState(null, '', '/verificar-correo#token=estricto');
      render(
        <StrictMode>
          <VerifyEmailView apiPublicUrl="http://localhost/api/v1" />
        </StrictMode>,
      );

      await waitFor(() => expect(replace).toHaveBeenCalledWith('/archivos'));
      expect(replace).toHaveBeenCalledTimes(1);
    });
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

  it('el éxito va en una tarjeta con ícono, los cuatro pasos completos y el plan Personal', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));
    window.history.replaceState(null, '', '/verificar-correo#token=tarjeta');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    const heading = await screen.findByRole('heading', {
      name: '¡Listo! Tu correo está verificado.',
    });
    const card = heading.closest('.shadow-card');
    expect(card).toBeTruthy();
    expect(card?.querySelector('svg[aria-hidden="true"]')).toBeTruthy();
    expect(card?.textContent).toContain('Plan Personal');
    const steps = screen.getByRole('list', { name: 'Pasos del registro' });
    expect(steps.querySelectorAll('.sr-only')).toHaveLength(4);
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain('Listo');
  });

  it('con un plan de pago, el aviso de CA-28 va dentro de la tarjeta del plan', async () => {
    saveChosenPlan(window.localStorage, { planId: 'eq', planName: 'Equipo' }, new Date());
    fetchMock.mockResolvedValue(jsonResponse({ status: 'verified' }));
    window.history.replaceState(null, '', '/verificar-correo#token=plan-tarjeta');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    const notice = await screen.findByText(/Podrás activar Equipo desde Plan y facturación/);
    expect(notice.closest('[data-plan-card]')?.textContent).toContain('Plan Personal');
  });

  it('ya verificado va en tarjeta, sin pasos del registro', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ status: 'already-verified' }));
    window.history.replaceState(null, '', '/verificar-correo#token=ya');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    const heading = await screen.findByRole('heading', { name: 'Correo verificado' });
    expect(heading.closest('.shadow-card')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Pasos del registro' })).toBeNull();
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
    const steps = screen.getByRole('list', { name: 'Pasos del registro' });
    expect(steps.querySelector('[aria-current="step"]')?.textContent).toContain('Verificación');
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' }).className).toContain(
      'bg-primary',
    );
  });

  it('CA-9: un 422 IDENTITY_VERIFICATION_LINK_EXPIRED muestra enlace-expirado', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { code: 'IDENTITY_VERIFICATION_LINK_EXPIRED', message: 'Venció', correlationId: 'corr-e' },
        422,
      ),
    );
    window.history.replaceState(null, '', '/verificar-correo#token=vencido');
    render(<VerifyEmailView apiPublicUrl="http://localhost/api/v1" />);

    expect(await screen.findByRole('heading', { name: 'Enlace vencido' })).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe(
      'Este enlace venció. Pide uno nuevo y ábrelo en las próximas 24 horas.',
    );
    expect(screen.getByRole('link', { name: 'Pedir un enlace nuevo' }).getAttribute('href')).toBe(
      '/registro/pedir-enlace',
    );
    expect(document.querySelector('[data-state="enlace-expirado"]')).toBeTruthy();
    expect(screen.queryByText(/Este enlace no es válido/)).toBeNull();
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
