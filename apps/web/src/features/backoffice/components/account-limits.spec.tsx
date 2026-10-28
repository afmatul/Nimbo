/**
 * @jest-environment jsdom
 */
import {
  BACKOFFICE_ERROR_CODES,
  BACKOFFICE_FIELD_MESSAGES,
  type AccountLimits,
  type AccountListItem,
} from '@nimbo/contracts';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { ApiClientError } from '../../../lib/api-error';
import { lastDayLabel } from '../../../lib/format-date';
import { accountItem, ANDREA } from '../test-accounts';
import {
  accountLimits,
  gb,
  NO_SUBSCRIPTION,
  PERSONAL,
  READ_ONLY,
  WITH_EXTRA,
} from '../test-limits';
import { apiError, loadOf } from '../test-loads';

import { PERSONAL_NO_EXPIRY } from './account-limits';
import { AccountProfile, type AccountProfileApi } from './account-profile';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

type Outcome = AccountLimits | Error;

interface LimitsDouble extends AccountProfileApi {
  readonly getAccountLimits: jest.Mock<Promise<AccountLimits>, [string]>;
  readonly adjustQuota: jest.Mock<Promise<AccountLimits>, [string, unknown]>;
  readonly removeQuota: jest.Mock<Promise<AccountLimits>, [string]>;
  readonly adjustValidity: jest.Mock<Promise<AccountLimits>, [string, unknown]>;
}

function inOrder<Args extends unknown[]>(results: readonly Outcome[]) {
  const call = jest.fn((..._args: Args) => new Promise<AccountLimits>(() => undefined));
  for (const result of results) {
    call.mockImplementationOnce(() =>
      result instanceof Error ? Promise.reject(result) : Promise.resolve(result),
    );
  }
  return call;
}

function apiOf(
  limits: readonly Outcome[],
  changes: { quota?: Outcome[]; remove?: Outcome[]; validity?: Outcome[] } = {},
  account: AccountListItem = accountItem(),
): LimitsDouble {
  return {
    getAccount: loadOf<string, AccountListItem>(account),
    suspendAccount: loadOf<string, AccountListItem>(),
    reactivateAccount: loadOf<string, AccountListItem>(),
    getAccountLimits: inOrder<[string]>(limits),
    adjustQuota: inOrder<[string, unknown]>(changes.quota ?? []),
    removeQuota: inOrder<[string]>(changes.remove ?? []),
    adjustValidity: inOrder<[string, unknown]>(changes.validity ?? []),
  };
}

async function renderLimits(api: AccountProfileApi): Promise<void> {
  render(<AccountProfile accountId={accountItem().id} api={api} />);
  await act(async () => undefined);
}

const block = () => within(screen.getByRole('region', { name: 'Límites y vigencia' }));
const dialog = (name: RegExp) => within(screen.getByRole('dialog', { name }));
const button = (name: string): HTMLElement => screen.getByRole('button', { name });

async function click(name: string): Promise<void> {
  await userEvent.click(button(name));
  await act(async () => undefined);
}

function fill(label: string, value: string): void {
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
}

const belowUsage = (): ApiClientError =>
  new ApiClientError({
    status: 422,
    code: BACKOFFICE_ERROR_CODES.QUOTA_BELOW_USAGE,
    message: 'x',
    correlationId: 'corr-1',
    details: { usedBytes: gb(108), totalQuotaBytes: gb(105) },
  });

describe('AccountLimitsCard: límites y vigencia en la ficha (011b CA-1, CA-2, CA-7, CA-17)', () => {
  it('CA-1: ficha: cuota del plan, sin extra, total con lo usado y vencimiento como último día', async () => {
    const api = apiOf([accountLimits()]);
    await renderLimits(api);

    expect(api.getAccountLimits).toHaveBeenCalledWith(accountItem().id);
    expect(block().getByText('Vigente')).toBeTruthy();
    expect(block().getAllByText('350 GB')).toHaveLength(2);
    expect(block().getByText('Sin extra')).toBeTruthy();
    expect(block().getByText('304 GB usados (87 %)')).toBeTruthy();
    expect(block().getByText(lastDayLabel(accountLimits().expiresAt ?? ''))).toBeTruthy();
    expect(block().getByRole('button', { name: 'Ajustar cuota' })).toBeTruthy();
    expect(block().getByRole('button', { name: 'Extender vigencia' })).toBeTruthy();
    expect(block().queryByRole('button', { name: 'Quitar extra' })).toBeNull();
  });

  it('CA-1: ajustar-cuota: el diálogo muestra el total resultante antes de guardar, con el foco en el extra', async () => {
    await renderLimits(apiOf([accountLimits()]));
    await click('Ajustar cuota');

    const form = dialog(/^Ajustar cuota de Laura Barrios/);
    expect(document.activeElement).toBe(screen.getByLabelText('Espacio extra'));
    fill('Espacio extra', '50');

    expect(form.getByText('400 GB')).toBeTruthy();
    expect(form.getByText(/\(76 %\)/)).toBeTruthy();
  });

  it('CA-1: cuota-guardada: PUT con bytes exactos y el día, aviso de éxito y el bloque con el extra', async () => {
    const api = apiOf([accountLimits()], { quota: [WITH_EXTRA] });
    await renderLimits(api);
    await click('Ajustar cuota');
    fill('Espacio extra', '50');
    fill('Vigente hasta', '2030-11-15');
    await click('Guardar cuota');

    expect(api.adjustQuota).toHaveBeenCalledWith(accountItem().id, {
      extraBytes: gb(50),
      until: '2030-11-15',
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    const until = lastDayLabel(WITH_EXTRA.extraQuotaUntil ?? '');
    expect(screen.getByText('Guardamos la cuota extra.')).toBeTruthy();
    expect(
      screen.getByText(`Laura tiene 50 GB extra hasta el ${until}; la cuota total es 400 GB.`),
    ).toBeTruthy();
    expect(block().getByText('+ 50 GB')).toBeTruthy();
    expect(block().getByRole('button', { name: 'Quitar extra' })).toBeTruthy();
    expect(document.activeElement).toBe(button('Ajustar cuota'));
  });

  it('CA-2: cuota-bajo-lo-usado: nombra lo usado y el total, el diálogo sigue abierto y el foco vuelve al extra', async () => {
    await renderLimits(apiOf([accountLimits()], { quota: [belowUsage()] }));
    await click('Ajustar cuota');
    fill('Espacio extra', '5');
    fill('Vigente hasta', '2030-11-15');
    await click('Guardar cuota');

    const form = dialog(/^Ajustar cuota/);
    expect(
      form.getByText(
        'La cuota total no puede quedar por debajo de lo que la cuenta ya usa (108 GB).',
      ),
    ).toBeTruthy();
    expect(form.getByText(/la cuota total sería 105 GB\. Nada cambió\./)).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByLabelText('Espacio extra'));
  });

  it('CA-3: cuota-invalida: extra cero y fecha pasada, con resumen y error en cada campo; no se envía', async () => {
    const api = apiOf([accountLimits()]);
    await renderLimits(api);
    await click('Ajustar cuota');
    fill('Espacio extra', '0');
    fill('Vigente hasta', '2000-01-01');
    await click('Guardar cuota');

    const summary = screen.getByRole('alert');
    expect(summary.textContent).toContain('Revisa los datos de la cuota. Nada cambió.');
    expect(
      within(summary).getByRole('link', { name: 'El espacio extra debe ser mayor que cero.' }),
    ).toBeTruthy();
    expect(screen.getAllByText('La fecha de fin no puede ser anterior a hoy.')).toHaveLength(2);
    expect(screen.getByLabelText('Espacio extra').getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(summary);
    expect(api.adjustQuota).not.toHaveBeenCalled();
  });

  it('CA-3: un 422 con `fields` del servidor se muestra en su campo con el texto de contracts', async () => {
    const rejected = apiError(422, BACKOFFICE_ERROR_CODES.QUOTA_INVALID, [
      { field: 'until', reason: 'INVALID_DAY', message: 'x' },
    ]);
    await renderLimits(apiOf([accountLimits()], { quota: [rejected] }));
    await click('Ajustar cuota');
    fill('Espacio extra', '50');
    fill('Vigente hasta', '2030-11-15');
    await click('Guardar cuota');

    expect(screen.getAllByText(BACKOFFICE_FIELD_MESSAGES.INVALID_DAY)).toHaveLength(2);
  });

  it('CA-17: un fallo de red al guardar deja el diálogo abierto con un aviso y el botón disponible', async () => {
    await renderLimits(apiOf([accountLimits()], { quota: [new TypeError('Failed to fetch')] }));
    await click('Ajustar cuota');
    fill('Espacio extra', '50');
    fill('Vigente hasta', '2030-11-15');
    await click('Guardar cuota');

    expect(dialog(/^Ajustar cuota/).getByText('No guardamos la cuota.')).toBeTruthy();
    expect((button('Guardar cuota') as HTMLButtonElement).disabled).toBe(false);
  });

  it('CA-4: quitar-extra y extra-quitado: confirma sin borrar nada, DELETE y la cuota vuelve al plan', async () => {
    const api = apiOf([WITH_EXTRA], { remove: [accountLimits()] });
    await renderLimits(api);
    await click('Quitar extra');

    const confirm = within(screen.getByRole('alertdialog', { name: /Quitar el espacio extra/ }));
    expect(confirm.getByText(/vuelve a 350 GB, la de su plan Equipo/)).toBeTruthy();
    expect(confirm.getByText(/No se borra ningún archivo/)).toBeTruthy();
    await userEvent.click(confirm.getByRole('button', { name: 'Quitar extra' }));
    await act(async () => undefined);

    expect(api.removeQuota).toHaveBeenCalledWith(accountItem().id);
    expect(screen.getByText('Quitamos el espacio extra.')).toBeTruthy();
    expect(
      screen.getByText(
        'La cuota volvió a 350 GB. Laura sigue dentro de su plan; no se borró nada.',
      ),
    ).toBeTruthy();
    expect(block().getByText('Sin extra')).toBeTruthy();
    expect(document.activeElement).toBe(button('Ajustar cuota'));
  });

  it('CA-4: «Quitar extra» no se ofrece si la cuota del plan no cubre lo usado', async () => {
    await renderLimits(apiOf([{ ...WITH_EXTRA, usedBytes: gb(380) }]));

    expect(block().queryByRole('button', { name: 'Quitar extra' })).toBeNull();
  });

  it('CA-6: extender-vigencia en solo lectura: el aviso, el último día como valor y PUT con el día elegido', async () => {
    const renewed = accountLimits({ expiresAt: '2030-12-01T06:00:00.000Z' });
    const api = apiOf([READ_ONLY], { validity: [renewed] });
    await renderLimits(api);

    expect(block().getByText('Solo lectura')).toBeTruthy();
    await click('Extender vigencia');
    const form = dialog(/^Extender la vigencia de Laura Barrios/);
    expect(form.getByText('La cuenta está en solo lectura.')).toBeTruthy();
    expect((screen.getByLabelText('Nueva fecha de vencimiento') as HTMLInputElement).value).toBe(
      '2026-10-20',
    );
    fill('Nueva fecha de vencimiento', '2030-11-30');
    await click('Guardar vigencia');

    expect(api.adjustValidity).toHaveBeenCalledWith(accountItem().id, { expiresAt: '2030-11-30' });
    expect(screen.getByText('Extendimos la vigencia.')).toBeTruthy();
    expect(
      screen.getByText(
        `La cuenta vence el ${lastDayLabel(renewed.expiresAt ?? '')} y volvió a vigente. No se cobró ni facturó nada.`,
      ),
    ).toBeTruthy();
    expect(block().getByText('Vigente')).toBeTruthy();
  });

  it('CA-7: fecha-no-posterior: la ayuda dice el último día y el mismo día se rechaza sin enviar', async () => {
    const api = apiOf([accountLimits()]);
    await renderLimits(api);
    await click('Extender vigencia');
    const lastDay = lastDayLabel(accountLimits().expiresAt ?? '');

    expect(
      screen.getByText(
        `Solo puedes extender la vigencia: elige un día posterior al ${lastDay}. No se cobra ni se factura.`,
      ),
    ).toBeTruthy();
    await click('Guardar vigencia');

    expect(screen.getByRole('alert').textContent).toContain('Revisa la fecha de vencimiento.');
    expect(screen.getAllByText(`Elige un día posterior al ${lastDay}.`)).toHaveLength(2);
    expect(api.adjustValidity).not.toHaveBeenCalled();
  });

  it('CA-7: el 422 `BACKOFFICE_VALIDITY_NOT_EXTENDED` del servidor se muestra en el campo', async () => {
    const rejected = apiError(422, BACKOFFICE_ERROR_CODES.VALIDITY_NOT_EXTENDED);
    await renderLimits(apiOf([accountLimits()], { validity: [rejected] }));
    await click('Extender vigencia');
    fill('Nueva fecha de vencimiento', '2030-12-15');
    await click('Guardar vigencia');

    const lastDay = lastDayLabel(accountLimits().expiresAt ?? '');
    expect(screen.getAllByText(`Elige un día posterior al ${lastDay}.`)).toHaveLength(2);
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('CA-7: personal-sin-vigencia: «Personal no vence», sin «Extender vigencia» y con «Ajustar cuota»', async () => {
    await renderLimits(apiOf([PERSONAL]));

    expect(block().getByText('Sin vencimiento')).toBeTruthy();
    expect(block().getByText('No vence')).toBeTruthy();
    expect(block().getByText(PERSONAL_NO_EXPIRY)).toBeTruthy();
    expect(PERSONAL_NO_EXPIRY).toBe('Personal no vence: no tiene vigencia que extender.');
    expect(block().queryByRole('button', { name: 'Extender vigencia' })).toBeNull();
    expect(block().getByRole('button', { name: 'Ajustar cuota' })).toBeTruthy();
  });

  it('CA-3: sin-suscripcion: no hay cuota ni vigencia que ajustar ni acciones', async () => {
    await renderLimits(apiOf([NO_SUBSCRIPTION]));

    expect(block().getByText('Esta cuenta no tiene suscripción.')).toBeTruthy();
    expect(block().queryAllByRole('button')).toHaveLength(0);
  });

  it('CA-17: limites-cargando: el bloque avisa con `role="status"` sin perder el resto de la ficha', async () => {
    await renderLimits(apiOf([]));

    expect(block().getByRole('status').textContent).toContain('Cargando la cuota y la vigencia…');
    expect(screen.getByRole('region', { name: 'Datos de la cuenta' })).toBeTruthy();
  });

  it('CA-17: limites-error: «Reintentar» vuelve a pedir los límites', async () => {
    const api = apiOf([new TypeError('Failed to fetch'), accountLimits()]);
    await renderLimits(api);

    expect(block().getByText('No pudimos cargar la cuota y la vigencia.')).toBeTruthy();
    await userEvent.click(block().getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(api.getAccountLimits).toHaveBeenCalledTimes(2);
    expect(block().getByText('Sin extra')).toBeTruthy();
  });

  it('CA-3: una cuenta interna no tiene el bloque ni pide sus límites', async () => {
    const api = apiOf([], {}, ANDREA);
    await renderLimits(api);

    expect(screen.queryByRole('region', { name: 'Límites y vigencia' })).toBeNull();
    expect(api.getAccountLimits).not.toHaveBeenCalled();
  });
});
