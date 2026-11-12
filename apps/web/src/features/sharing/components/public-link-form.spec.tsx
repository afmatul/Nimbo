/**
 * @jest-environment jsdom
 */
import {
  SHARED_ERROR_CODES,
  SHARING_ERROR_CODES,
  STORAGE_ERROR_CODES,
  type CreatedPublicLink,
} from '@nimbo/contracts';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { StorageRequestError } from '../../storage/storage-request-error';
import type { PublicLinkChoice } from '../hooks/use-public-link';
import { NODE_ID, PUBLIC_LINK_URL, never, publicLink } from '../test-sharing';

import { PublicLinkForm, type PublicLinkFormProps } from './public-link-form';

const PASSWORD_ERROR = 'Escribe una contraseña de 8 a 128 caracteres.';
const VALID_PASSWORD = 'puente-azul-27';
const CREATED: CreatedPublicLink = { link: publicLink(), url: PUBLIC_LINK_URL };

type Generate = jest.Mock<Promise<CreatedPublicLink>, [PublicLinkChoice]>;
const generate = (impl: () => Promise<CreatedPublicLink>): Generate =>
  jest.fn<Promise<CreatedPublicLink>, [PublicLinkChoice]>(impl);

function renderForm(overrides: Partial<PublicLinkFormProps> = {}) {
  const props = {
    fileId: NODE_ID,
    onGenerate: generate(() => Promise.resolve(CREATED)),
    onCancel: jest.fn(),
    onReadOnly: jest.fn(),
    ...overrides,
  };
  render(<PublicLinkForm {...props} />);
  return props;
}

const passwordInput = (): HTMLInputElement =>
  screen.getByLabelText('Contraseña (opcional)') as HTMLInputElement;
const expiry = (label: string): HTMLInputElement =>
  screen.getByRole('radio', { name: label }) as HTMLInputElement;
const generateButton = (name = 'Generar enlace'): HTMLElement =>
  screen.getByRole('button', { name });

async function choose30AndType(password: string): Promise<void> {
  await userEvent.click(expiry('30 días'));
  if (password !== '') await userEvent.type(passwordInput(), password);
}

describe('PublicLinkForm: vencimiento y contraseña opcional (spec 013c CA-3, CA-4)', () => {
  it('CA-3: ofrece 1, 7 y 30 días con 7 marcado y el foco en la opción marcada', async () => {
    renderForm();

    expect(screen.getByRole('group', { name: 'Vence en' })).toBeTruthy();
    expect(expiry('1 día').checked).toBe(false);
    expect(expiry('7 días').checked).toBe(true);
    expect(expiry('30 días').checked).toBe(false);
    await waitFor(() => expect(document.activeElement).toBe(expiry('7 días')));
  });

  it('CA-3: la contraseña pide al navegador no rellenarla y lleva su ayuda asociada', () => {
    renderForm();

    const input = passwordInput();
    expect(input.getAttribute('autocomplete')).toBe('new-password');
    expect(input.getAttribute('name')).toBe('enlace-contrasena');
    expect(input.getAttribute('maxlength')).toBe('128');
    expect(input.getAttribute('aria-invalid')).toBeNull();
    const hint = document.getElementById(input.getAttribute('aria-describedby') ?? '');
    expect(hint?.textContent).toBe(
      'Si la pones, se pedirá para descargar. De 8 a 128 caracteres. No uses la de tu cuenta y compártela por otro medio.',
    );
  });

  it('CA-4: con la contraseña vacía genera sin error con el vencimiento elegido', async () => {
    const { onGenerate } = renderForm();

    await choose30AndType('');
    await userEvent.click(generateButton());

    expect(onGenerate).toHaveBeenCalledWith({ expiresInDays: 30, password: '' });
    expect(screen.queryByText(PASSWORD_ERROR)).toBeNull();
  });

  it('CA-3: con una contraseña válida la envía y la borra del formulario al generar', async () => {
    const { onGenerate } = renderForm();

    await choose30AndType(VALID_PASSWORD);
    await userEvent.click(generateButton());

    expect(onGenerate).toHaveBeenCalledWith({ expiresInDays: 30, password: VALID_PASSWORD });
    await waitFor(() => expect(passwordInput().value).toBe(''));
  });

  it('CA-8: al reemplazar, el botón dice «Generar otro enlace»', () => {
    renderForm({ replacing: true });

    expect(generateButton('Generar otro enlace')).toBeTruthy();
  });

  it('CA-3: «Cancelar» avisa sin generar', async () => {
    const { onCancel, onGenerate } = renderForm();

    await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onGenerate).not.toHaveBeenCalled();
  });
});

describe('PublicLinkForm: contraseña inválida junto al campo (spec 013c CA-5)', () => {
  function expectFieldError(): void {
    const input = passwordInput();
    const error = screen.getByText(PASSWORD_ERROR);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby')?.split(' ') ?? [];
    expect(describedBy).toContain(error.closest('[id]')?.id);
    expect(document.activeElement).toBe(input);
    expect(screen.queryAllByRole('alert')).toHaveLength(1);
  }

  it.each(['a', 'abc1234'])(
    'CA-5: con «%s» no envía nada, marca el campo y conserva el vencimiento',
    async (password) => {
      const { onGenerate } = renderForm();

      await choose30AndType(password);
      await userEvent.click(generateButton());

      expectFieldError();
      expect(onGenerate).not.toHaveBeenCalled();
      expect(expiry('30 días').checked).toBe(true);
    },
  );

  it('CA-5: con más de 128 caracteres tampoco envía nada', async () => {
    const { onGenerate } = renderForm();

    fireEvent.change(passwordInput(), { target: { value: 'x'.repeat(129) } });
    await userEvent.click(generateButton());

    expectFieldError();
    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('CA-5: el `422` de la API por la contraseña se muestra igual, junto al campo', async () => {
    const onGenerate = generate(() =>
      Promise.reject(
        new StorageRequestError(422, SHARING_ERROR_CODES.SHARING_INVALID_REQUEST, {}, [
          { field: 'password', reason: 'INVALID_PASSWORD', message: PASSWORD_ERROR },
        ]),
      ),
    );
    renderForm({ onGenerate });

    await choose30AndType(VALID_PASSWORD);
    await userEvent.click(generateButton());

    await waitFor(expectFieldError);
    expect(expiry('30 días').checked).toBe(true);
  });
});

describe('PublicLinkForm: progreso y errores al generar (spec 013c CA-3, CA-10, CA-12, CA-13)', () => {
  afterEach(() => jest.useRealTimers());

  it('CA-3: pasados 2 s dice «Generando…» con `aria-disabled`, lo anuncia y no envía dos veces', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: (ms) => jest.advanceTimersByTime(ms) });
    const onGenerate = generate(() => never<CreatedPublicLink>());
    renderForm({ onGenerate });

    await user.click(generateButton());
    act(() => jest.advanceTimersByTime(2_000));

    const busy = generateButton('Generando…');
    expect(busy.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Cancelar' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Generando…', { selector: '[role="status"]' })).toBeTruthy();
    await user.click(busy);
    expect(onGenerate).toHaveBeenCalledTimes(1);
  });

  it('CA-12: un `429` va en un aviso de advertencia con la espera y conserva lo elegido', async () => {
    const onGenerate = generate(() =>
      Promise.reject(
        new StorageRequestError(429, SHARED_ERROR_CODES.TOO_MANY_REQUESTS, {
          retryAfterSeconds: 900,
        }),
      ),
    );
    renderForm({ onGenerate });

    await choose30AndType(VALID_PASSWORD);
    await userEvent.click(generateButton());

    const notice = await screen.findByText(
      'Hiciste demasiados intentos. Espera 15 minutos e inténtalo de nuevo.',
    );
    expect(notice.closest('[role="status"]')?.className).toContain('border-warning');
    expect(screen.queryByRole('alert')).toBeNull();
    expect(expiry('30 días').checked).toBe(true);
    expect(passwordInput().value).toBe(VALID_PASSWORD);
  });

  it('CA-13: si la red falla, «Reintentar» vuelve a generar con lo elegido', async () => {
    const onGenerate = jest
      .fn<Promise<CreatedPublicLink>, [PublicLinkChoice]>()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValue(CREATED);
    renderForm({ onGenerate });

    await choose30AndType(VALID_PASSWORD);
    await userEvent.click(generateButton());
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(
      'No pudimos completar la acción. Revisa tu conexión e inténtalo de nuevo.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Reintentar' }));

    expect(onGenerate).toHaveBeenLastCalledWith({ expiresInDays: 30, password: VALID_PASSWORD });
  });

  it('CA-10: el `403` de solo lectura avisa a la sección, sin aviso propio, y conserva lo elegido', async () => {
    const onGenerate = generate(() =>
      Promise.reject(new StorageRequestError(403, STORAGE_ERROR_CODES.STORAGE_ACCOUNT_READ_ONLY)),
    );
    const { onReadOnly } = renderForm({ onGenerate });

    await choose30AndType(VALID_PASSWORD);
    await userEvent.click(generateButton());

    await waitFor(() => expect(onReadOnly).toHaveBeenCalled());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(expiry('30 días').checked).toBe(true);
    expect(passwordInput().value).toBe(VALID_PASSWORD);
  });

  it('spec §5: la contraseña no llega a `console` ni al almacenamiento del navegador', async () => {
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    const logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) =>
      jest.spyOn(console, level).mockImplementation(() => undefined),
    );
    renderForm();

    await choose30AndType(VALID_PASSWORD);
    await userEvent.click(generateButton());

    for (const spy of [setItem, ...logs]) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain(VALID_PASSWORD);
    }
    jest.restoreAllMocks();
  });
});
