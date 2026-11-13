/**
 * @jest-environment jsdom
 */
import { IDENTITY_ERROR_CODES, IDENTITY_FIELD_MESSAGES } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RegisterForm } from './register-form';

const PLANS = [
  { id: 'personal', slug: 'personal', name: 'Personal', priceCents: 0, free: true as const },
  { id: 'pro', slug: 'pro', name: 'Pro', priceCents: 4500, free: false as const },
];

/** Paso «Cuenta» completo y «Continuar» al paso «Plan». */
async function fillAccountAndContinue(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Nombre completo'), 'Ana López');
  await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
  await user.type(screen.getByLabelText('Contraseña'), 'UnaClaveSegura!1');
  await user.click(screen.getByRole('checkbox'));
  await user.click(screen.getByRole('button', { name: 'Continuar' }));
}

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('RegisterForm', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('la casilla tiene dos enlaces; con el plan gratuito no se envía `planSlug`', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    render(
      <RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />,
    );

    expect(screen.getByRole('link', { name: 'Términos' }).getAttribute('href')).toBe('/terminos');
    expect(screen.getByRole('link', { name: 'Política de privacidad' }).getAttribute('href')).toBe(
      '/privacidad',
    );
    for (const name of ['Términos', 'Política de privacidad']) {
      expect(screen.getByRole('link', { name }).className).toContain('underline');
    }

    await fillAccountAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('planId');
    expect(body).not.toHaveProperty('planSlug');
    expect(body).toMatchObject({ email: 'ana@ejemplo.com', acceptTerms: true });
  });

  it('Paso «Plan»: no avanza con la cuenta incompleta; con ella, elige un plan de pago y envía su `planSlug`', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    const onStep = jest.fn();
    render(
      <RegisterForm
        apiPublicUrl="http://localhost/api/v1"
        plans={PLANS}
        onSuccess={jest.fn()}
        onStepChange={onStep}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Continuar' }));
    expect(screen.queryByRole('heading', { name: 'Elige tu plan' })).toBeNull();

    await fillAccountAndContinue(user);
    expect(screen.getByRole('heading', { name: 'Elige tu plan' })).toBeTruthy();
    expect(onStep).toHaveBeenLastCalledWith('plan');
    expect((screen.getByRole('radio', { name: /Personal/ }) as HTMLInputElement).checked).toBe(
      true,
    );
    await user.click(screen.getByRole('radio', { name: /Pro/ }));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).toMatchObject({ email: 'ana@ejemplo.com', planSlug: 'pro' });
  });

  it('Paso «Plan»: `INVALID_PLAN` se muestra en el paso «Plan», sin volver a la cuenta', async () => {
    const user = userEvent.setup();
    const message = IDENTITY_FIELD_MESSAGES.INVALID_PLAN;
    fetchMock.mockResolvedValue(
      jsonResponse(
        {
          code: IDENTITY_ERROR_CODES.INVALID_INPUT,
          message: 'Revisa los datos.',
          correlationId: 'corr-3',
          fields: [{ field: 'planSlug', reason: 'INVALID_PLAN', message }],
        },
        422,
      ),
    );
    render(
      <RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />,
    );

    await fillAccountAndContinue(user);
    await user.click(screen.getByRole('radio', { name: /Pro/ }));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const planStep = await screen.findByText(message);
    expect(planStep.getAttribute('role')).toBe('alert');
    expect(screen.getByRole('heading', { name: 'Elige tu plan' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: /Pro/ })).toBeTruthy();
  });

  it('Paso «Plan»: «Volver» regresa a la cuenta con los datos escritos', async () => {
    const user = userEvent.setup();
    render(
      <RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />,
    );

    await fillAccountAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Volver' }));

    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('ana@ejemplo.com');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('Paso «Plan»: el plan que trae el catálogo público (`?plan=`) llega preseleccionado', async () => {
    const user = userEvent.setup();
    render(
      <RegisterForm
        apiPublicUrl="http://localhost/api/v1"
        plans={PLANS}
        defaultPlanId="pro"
        onSuccess={jest.fn()}
      />,
    );

    await fillAccountAndContinue(user);

    expect((screen.getByRole('radio', { name: /Pro/ }) as HTMLInputElement).checked).toBe(true);
  });

  it('un error de servidor muestra el correlationId y deshabilita el botón mientras envía', async () => {
    const user = userEvent.setup();
    let resolveFetch: (response: Response) => void = () => undefined;
    fetchMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFetch = resolve;
        }),
    );
    render(
      <RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />,
    );

    await fillAccountAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(
      (screen.getByRole('button', { name: 'Creando tu cuenta' }) as HTMLButtonElement).disabled,
    ).toBe(true);
    resolveFetch(
      jsonResponse(
        {
          code: 'INTERNAL_ERROR',
          message: 'Fallo',
          correlationId: 'corr-9',
        },
        500,
      ),
    );
    expect((await screen.findByRole('alert')).textContent).toContain('corr-9');
  });

  it('un error general del servidor mueve el foco al resumen', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(
      jsonResponse({ code: 'INTERNAL_ERROR', message: 'Fallo', correlationId: 'corr-7' }, 500),
    );
    render(
      <RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />,
    );

    await fillAccountAndContinue(user);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const summary = await screen.findByRole('alert');
    await waitFor(() => {
      expect(document.activeElement).toBe(summary);
    });
  });

  it('no tiene violaciones graves de accesibilidad', async () => {
    const view = render(
      <RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />,
    );
    const results = await axe(view.container);
    expect(
      results.violations.filter(
        (violation) => violation.impact === 'serious' || violation.impact === 'critical',
      ),
    ).toEqual([]);
  });
});
