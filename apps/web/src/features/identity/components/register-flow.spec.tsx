/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { RegisterFlow } from './register-flow';

const PLANS = [
  { id: 'personal', name: 'Personal', priceCents: 0, free: true as const },
  { id: 'pro', name: 'Profesional', priceCents: 45000, free: false as const },
];

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

async function fillAccount(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.type(screen.getByLabelText('Nombre completo'), 'Ana López');
  await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
  await user.type(screen.getByLabelText('Contraseña'), 'UnaClaveSegura!1');
  await user.click(screen.getByRole('checkbox'));
}

describe('RegisterFlow', () => {
  const fetchMock = jest.fn<typeof fetch>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    window.localStorage.clear();
  });

  it('al crear la cuenta muestra Revisa tu correo', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    render(<RegisterFlow apiPublicUrl="http://localhost/api/v1" plans={PLANS} />);

    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
    expect(screen.getByText(/ana@ejemplo.com/)).toBeTruthy();
    expect(window.localStorage.getItem('nimbo.registro.plan')).toBeNull();
  });

  it('un plan de pago se guarda y Cambiar correo conserva nombre y plan', async () => {
    const user = userEvent.setup();
    fetchMock.mockResolvedValue(jsonResponse({ status: 'accepted' }, 202));
    render(<RegisterFlow apiPublicUrl="http://localhost/api/v1" plans={PLANS} />);

    await user.click(screen.getByRole('radio', { name: /Profesional/ }));
    await fillAccount(user);
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));
    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();

    const stored = JSON.parse(window.localStorage.getItem('nimbo.registro.plan') ?? '') as Record<string, unknown>;
    expect(stored).toMatchObject({ planId: 'pro', planName: 'Profesional' });
    expect(stored).not.toHaveProperty('email');

    await user.click(screen.getByRole('button', { name: 'Cambiar correo' }));

    expect((screen.getByLabelText('Nombre completo') as HTMLInputElement).value).toBe('Ana López');
    expect((screen.getByLabelText('Correo') as HTMLInputElement).value).toBe('ana@ejemplo.com');
    expect((screen.getByLabelText('Contraseña') as HTMLInputElement).value).toBe('');
    expect((screen.getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
    expect((screen.getByRole('radio', { name: /Profesional/ }) as HTMLInputElement).checked).toBe(true);
  });
});
