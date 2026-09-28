/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'jest-axe';

import { RegisterForm } from './register-form';

const PLANS = [{ id: 'personal', name: 'Personal', priceCents: 0, free: true as const }];

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('RegisterForm', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('la casilla tiene dos enlaces y el plan no se envía', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    render(
      <RegisterForm
        apiPublicUrl="http://localhost/api/v1"
        plans={PLANS}
        onSuccess={jest.fn()}
      />,
    );

    expect(screen.getByRole('link', { name: 'Términos' }).getAttribute('href')).toBe('/terminos');
    expect(screen.getByRole('link', { name: 'Política de privacidad' }).getAttribute('href')).toBe('/privacidad');

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana López');
    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.type(screen.getByLabelText('Contraseña'), 'UnaClaveSegura!1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    const body = JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)) as Record<string, unknown>;
    expect(body).not.toHaveProperty('planId');
    expect(body).toMatchObject({ email: 'ana@ejemplo.com', acceptTerms: true });
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
    render(<RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />);

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana López');
    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.type(screen.getByLabelText('Contraseña'), 'UnaClaveSegura!1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect((screen.getByRole('button', { name: 'Creando tu cuenta' }) as HTMLButtonElement).disabled).toBe(true);
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

  it('no tiene violaciones graves de accesibilidad', async () => {
    const view = render(<RegisterForm apiPublicUrl="http://localhost/api/v1" plans={PLANS} onSuccess={jest.fn()} />);
    const results = await axe(view.container);
    expect(results.violations.filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')).toEqual([]);
  });
});
