/**
 * @jest-environment jsdom
 */
import type { Plan } from '@nimbo/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import RegistroPage, { revalidate } from './page';

const PERSONAL: Plan = {
  id: '10000000-0000-4000-8000-000000000001',
  slug: 'personal',
  name: 'Personal',
  description: null,
  priceCents: 0,
  quotaBytes: '16106127360',
  maxFileBytes: '52428800',
  maxEditors: 0,
  agentQueriesPerMonth: 20,
  retainedVersions: 3,
  trashRetentionDays: 7,
};

function jsonResponse(body: unknown, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('página /registro', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
  });

  it('revalida el catálogo cada 60 s', () => {
    expect(revalidate).toBe(60);
  });

  it('muestra los planes del catálogo y envía el registro a API_PUBLIC_URL', async () => {
    const user = userEvent.setup();
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url.endsWith('/billing/plans')) {
        return Promise.resolve(jsonResponse({ plans: [PERSONAL] }, 200));
      }
      return Promise.resolve(jsonResponse({ status: 'accepted' }, 202));
    });

    render(await RegistroPage());

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe('http://internal.test/api/v1/billing/plans');
    expect(screen.getByText(/Personal/)).toBeTruthy();

    await user.type(screen.getByLabelText('Nombre completo'), 'Ana López');
    await user.type(screen.getByLabelText('Correo'), 'ana@ejemplo.com');
    await user.type(screen.getByLabelText('Contraseña'), 'UnaClaveSegura!1');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

    expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeTruthy();
    const registerCall = fetchMock.mock.calls.find((call) =>
      String(call[0]).endsWith('/auth/register'),
    );
    expect(String(registerCall?.[0])).toBe('http://localhost/api/v1/auth/register');
  });

  it.each([
    ['404', () => Promise.resolve(jsonResponse({ message: 'no' }, 404))],
    ['error', () => Promise.reject(new Error('red'))],
  ])('un %s deja el catálogo no disponible y el formulario sigue', async (_label, respond) => {
    fetchMock.mockImplementation(respond);
    render(await RegistroPage());

    expect(
      screen.getByText('No pudimos cargar los planes; tu cuenta empezará en Personal.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeTruthy();
    expect(screen.getByLabelText('Correo')).toBeTruthy();
  });

  it('más de 2 s deja el catálogo no disponible y el formulario sigue', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'queueMicrotask', 'setImmediate'] });
    fetchMock.mockImplementation(
      (_input, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new Error('aborted'));
          });
        }),
    );

    const pending = RegistroPage();
    await jest.advanceTimersByTimeAsync(2_000);
    render(await pending);

    expect(
      screen.getByText('No pudimos cargar los planes; tu cuenta empezará en Personal.'),
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeTruthy();
    jest.useRealTimers();
  });
});
