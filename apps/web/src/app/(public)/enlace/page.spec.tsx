/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';

import { PUBLIC_LINK_DETAILS } from '../../../features/sharing/test-public-link';

import EnlacePage, { metadata } from './page';

const TOKEN = 'AbC-123_xyz';

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
    headers: { get: () => null },
  } as unknown as Response;
}

describe('página del enlace público (013b CA-8, CA-9, S-5)', () => {
  const fetchMock = jest.fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
    process.env['APP_ENV'] = 'test';
    process.env['API_INTERNAL_URL'] = 'http://internal.test';
    process.env['API_PUBLIC_URL'] = 'http://localhost/api/v1';
    window.history.replaceState(null, '', `/enlace#${TOKEN}`);
  });

  it('CA-8: el título de la pestaña es genérico, sin el nombre del archivo ni el token', () => {
    expect(metadata.title).toBe('Archivo compartido · Nimbo');
  });

  it('S-5: la página no se indexa en buscadores', () => {
    expect(metadata.robots).toEqual({ index: false });
  });

  it('CA-9: abre la ficha contra API_PUBLIC_URL con el token del fragmento en el cuerpo', async () => {
    fetchMock.mockResolvedValue(jsonResponse(PUBLIC_LINK_DETAILS));
    render(<EnlacePage />);

    expect(
      await screen.findByRole('heading', { name: 'Andrea Morales compartió un archivo contigo' }),
    ).toBeTruthy();
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(String(url)).toBe('http://localhost/api/v1/public-links/open');
    expect(init?.body).toBe(JSON.stringify({ token: TOKEN }));
    expect(window.location.hash).toBe(`#${TOKEN}`);
  });
});
