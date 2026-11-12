/**
 * @jest-environment jsdom
 */
import type { CreatedPublicLink } from '@nimbo/contracts';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { PUBLIC_LINK_URL, publicLink } from '../test-sharing';

import { GeneratedLinkField } from './generated-link-field';

const GENERATED: CreatedPublicLink = { link: publicLink(), url: PUBLIC_LINK_URL };
const COPY_FAILED = 'No pudimos copiar el enlace. Selecciónalo y cópialo a mano.';

const urlInput = (): HTMLInputElement =>
  screen.getByRole('textbox', { name: 'Enlace generado' }) as HTMLInputElement;
const copyButton = (name = 'Copiar enlace'): HTMLElement => screen.getByRole('button', { name });

describe('GeneratedLinkField: la URL generada (spec 013c CA-3)', () => {
  it('CA-3: muestra la URL completa en un campo de solo lectura con el vencimiento y si pide contraseña', () => {
    render(<GeneratedLinkField generated={GENERATED} />);

    const input = urlInput();
    expect(input.value).toBe(PUBLIC_LINK_URL);
    expect(input.readOnly).toBe(true);
    const meta = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(meta?.textContent).toContain('Vence el 18 nov 2026, 14:30');
    expect(meta?.textContent).toContain('Sin contraseña');
  });

  it('CA-3: dice «Con contraseña» si el enlace la pide', () => {
    render(
      <GeneratedLinkField generated={{ ...GENERATED, link: publicLink({ hasPassword: true }) }} />,
    );

    expect(screen.getByText('Con contraseña')).toBeTruthy();
  });

  it('CA-15: al aparecer, el foco va a «Copiar enlace»', async () => {
    render(<GeneratedLinkField generated={GENERATED} />);

    await waitFor(() => expect(document.activeElement).toBe(copyButton()));
  });
});

describe('GeneratedLinkField: copiar (spec 013c CA-6)', () => {
  it('CA-6: copia al portapapeles del navegador, lo anuncia y el botón lo dice hasta la siguiente interacción', async () => {
    const user = userEvent.setup();
    render(<GeneratedLinkField generated={GENERATED} />);

    await user.click(copyButton());

    expect(await navigator.clipboard.readText()).toBe(PUBLIC_LINK_URL);
    expect(copyButton('Enlace copiado')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Enlace copiado');
    await user.keyboard('{Shift}');
    expect(copyButton()).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('');
  });

  it('CA-6: si el navegador no deja copiar, avisa y deja el texto del campo seleccionado', async () => {
    const copy = jest.fn(() => Promise.reject(new Error('NotAllowedError')));
    render(<GeneratedLinkField generated={GENERATED} copy={copy} />);

    await userEvent.click(copyButton());

    expect((await screen.findByRole('alert')).textContent).toContain(COPY_FAILED);
    const input = urlInput();
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([0, PUBLIC_LINK_URL.length]);
    expect(copyButton()).toBeTruthy();
  });

  it('CA-6: un nuevo intento que sale bien quita el aviso de fallo', async () => {
    const copy = jest
      .fn<Promise<void>, [string]>()
      .mockRejectedValueOnce(new Error('NotAllowedError'))
      .mockResolvedValue(undefined);
    render(<GeneratedLinkField generated={GENERATED} copy={copy} />);

    await userEvent.click(copyButton());
    await screen.findByRole('alert');
    await userEvent.click(copyButton());

    expect(await screen.findByRole('button', { name: 'Enlace copiado' })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('spec §5: la URL no llega a `console` ni al almacenamiento del navegador', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined),
    );
    const copy = jest.fn(() => Promise.reject(new Error('NotAllowedError')));
    render(<GeneratedLinkField generated={GENERATED} copy={copy} />);

    await userEvent.click(copyButton());
    await screen.findByRole('alert');

    for (const spy of [setItem, ...logs]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(PUBLIC_LINK_URL);
    }
    jest.restoreAllMocks();
  });
});
