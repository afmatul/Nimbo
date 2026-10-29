/**
 * @jest-environment jsdom
 */
import { IDENTITY_ERROR_CODES, SHARED_ERROR_CODES, type AccountListItem } from '@nimbo/contracts';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { accountItem, ANDREA, MONICA } from '../test-accounts';
import { accountLimits, pendingLimitsApi } from '../test-limits';
import { apiError, loadOf } from '../test-loads';

import { AccountProfile, type AccountProfileApi } from './account-profile';

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

type Outcome = AccountListItem | Error;

interface ApiDouble {
  readonly getAccount: jest.Mock<Promise<AccountListItem>, [string]>;
  readonly suspendAccount: jest.Mock<Promise<AccountListItem>, [string]>;
  readonly reactivateAccount: jest.Mock<Promise<AccountListItem>, [string]>;
}

function apiOf(
  account: readonly Outcome[],
  { suspend = [], reactivate = [] }: { suspend?: Outcome[]; reactivate?: Outcome[] } = {},
): ApiDouble & AccountProfileApi {
  return {
    getAccount: loadOf<string, AccountListItem>(...account),
    suspendAccount: loadOf<string, AccountListItem>(...suspend),
    reactivateAccount: loadOf<string, AccountListItem>(...reactivate),
    ...pendingLimitsApi(),
    // Límites ya cargados: el bloque de la 011b no añade otro `role="status"` a los avisos de la ficha.
    getAccountLimits: () => Promise.resolve(accountLimits()),
  };
}

async function renderProfile(api: AccountProfileApi, id: string = accountItem().id): Promise<void> {
  render(<AccountProfile accountId={id} api={api} />);
  await act(async () => undefined);
}

const button = (name: string): HTMLElement => screen.getByRole('button', { name });

async function confirmIn(dialogName: RegExp, confirmLabel: string): Promise<void> {
  const dialog = screen.getByRole('alertdialog', { name: dialogName });
  await userEvent.click(within(dialog).getByRole('button', { name: confirmLabel }));
  await act(async () => undefined);
}

const SUSPENDED = accountItem({ status: 'suspended' });

describe('AccountProfile: ficha de una cuenta (011 CA-1 a CA-4, CA-17)', () => {
  it('CA-1: ficha: datos de la cuenta sin archivos, aviso de privacidad y acciones', async () => {
    const api = apiOf([accountItem()]);
    await renderProfile(api);

    expect(api.getAccount).toHaveBeenCalledWith(accountItem().id);
    expect(screen.getByRole('heading', { level: 1, name: 'Laura Barrios' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a cuentas' }).getAttribute('href')).toBe(
      '/admin/cuentas',
    );
    const facts = within(screen.getByRole('region', { name: 'Datos de la cuenta' }));
    expect(facts.getByText('Equipo')).toBeTruthy();
    expect(facts.getByText('304 GB')).toBeTruthy();
    expect(facts.getByText('01/09/2026')).toBeTruthy();
    expect(facts.getByText('Activa')).toBeTruthy();
  });

  it('CA-13: en un cliente, «Ver metadatos de archivos» lleva a su vista por id, sin el correo en la URL', async () => {
    await renderProfile(apiOf([accountItem()]));

    const link = screen.getByRole('link', { name: 'Ver metadatos de archivos' });
    expect(link.getAttribute('href')).toBe(`/admin/cuentas/${accountItem().id}/metadatos`);
    expect(link.getAttribute('href')).not.toContain('@');
    expect(screen.getByText(/La consulta queda en la auditoría que ve Laura\./)).toBeTruthy();
  });

  it('CA-2: confirmar-suspender: diálogo con las consecuencias y el foco en «Cancelar»; cancelar no cambia nada', async () => {
    const api = apiOf([accountItem()]);
    await renderProfile(api);

    await userEvent.click(button('Suspender cuenta'));

    const dialog = screen.getByRole('alertdialog', {
      name: '¿Suspender la cuenta de Laura Barrios?',
    });
    expect(dialog.textContent).toContain(
      'laura.barrios@alpha.gt no podrá iniciar sesión hasta que la reactives.',
    );
    expect(dialog.textContent).toContain(
      'Sus comparticiones y enlaces públicos dejarán de funcionar',
    );
    expect(dialog.textContent).toContain('verá tu rol, no tu nombre');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.suspendAccount).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(button('Suspender cuenta')));
  });

  it('CA-2: suspendida: el aviso de éxito, el estado nuevo y «Reactivar cuenta», con el foco en la acción', async () => {
    const api = apiOf([accountItem()], { suspend: [SUSPENDED] });
    await renderProfile(api);

    await userEvent.click(button('Suspender cuenta'));
    await confirmIn(/¿Suspender la cuenta/, 'Suspender cuenta');

    expect(api.suspendAccount).toHaveBeenCalledWith(accountItem().id);
    const notice = screen.getByRole('status');
    expect(notice.textContent).toContain(
      'Esta cuenta quedó suspendida y se cerraron sus sesiones.',
    );
    expect(notice.textContent).toContain(
      'Sus comparticiones y enlaces públicos están en pausa hasta que la reactives. No se borró nada.',
    );
    expect(screen.getAllByText('Suspendida').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Suspender cuenta' })).toBeNull();
    await waitFor(() => expect(document.activeElement).toBe(button('Reactivar cuenta')));
  });

  it('CA-3: confirmar-reactivar: sin estilo destructivo; al confirmar la cuenta queda activa', async () => {
    const api = apiOf([SUSPENDED], { reactivate: [accountItem()] });
    await renderProfile(api);

    await userEvent.click(button('Reactivar cuenta'));
    const dialog = screen.getByRole('alertdialog', {
      name: '¿Reactivar la cuenta de Laura Barrios?',
    });
    expect(dialog.textContent).toContain('Las sesiones que se cerraron al suspenderla no vuelven');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(
      within(dialog).getByRole('button', { name: 'Reactivar cuenta' }).className,
    ).not.toContain('bg-destructive');
    await confirmIn(/¿Reactivar la cuenta/, 'Reactivar cuenta');

    expect(api.reactivateAccount).toHaveBeenCalledWith(accountItem().id);
    expect(screen.getByRole('status').textContent).toContain('Esta cuenta quedó activa de nuevo.');
    expect(button('Suspender cuenta')).toBeTruthy();
  });

  it('CA-4: propia-cuenta: sin «Suspender» y con el motivo; plan y espacio no aplican', async () => {
    await renderProfile(apiOf([MONICA]), MONICA.id);

    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Mónica HerreraTÚ');
    expect(screen.queryByRole('button', { name: 'Suspender cuenta' })).toBeNull();
    expect(screen.getByText('No puedes suspender tu propia cuenta.')).toBeTruthy();
    expect(screen.getByText('Las cuentas internas no guardan archivos.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Ver metadatos de archivos' })).toBeNull();
  });

  it('CA-2, RN-6: suspender una interna no habla de comparticiones ni enlaces', async () => {
    await renderProfile(apiOf([ANDREA]), ANDREA.id);

    await userEvent.click(button('Suspender cuenta'));

    const dialog = screen.getByRole('alertdialog', {
      name: '¿Suspender la cuenta de Andrea Ruiz?',
    });
    expect(dialog.textContent).not.toContain('comparticiones');
  });

  it('CA-4: si el servidor lo rechaza, la ficha dice por qué, nada cambia y el diálogo se cierra', async () => {
    const api = apiOf([accountItem()], {
      suspend: [apiError(409, IDENTITY_ERROR_CODES.LAST_ACTIVE_ADMIN)],
    });
    await renderProfile(api);

    await userEvent.click(button('Suspender cuenta'));
    await confirmIn(/¿Suspender la cuenta/, 'Suspender cuenta');

    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('alert').textContent).toContain(
      'No se puede suspender: debe quedar al menos un Administrador activo. Nada cambió.',
    );
    expect(button('Suspender cuenta')).toBeTruthy();
  });

  it('CA-14: un 403 al suspender (el Administrador ya no está activo) muestra «Sin permiso»', async () => {
    const api = apiOf([accountItem()], { suspend: [apiError(403, SHARED_ERROR_CODES.FORBIDDEN)] });
    await renderProfile(api);

    await userEvent.click(button('Suspender cuenta'));
    await confirmIn(/¿Suspender la cuenta/, 'Suspender cuenta');

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 1, name: 'Laura Barrios' })).toBeNull();
  });

  it('CA-17: cargando la ficha', async () => {
    await renderProfile(apiOf([]));

    expect(screen.getByRole('status').textContent).toContain('Cargando la cuenta…');
  });

  it('CA-17: una cuenta que no existe muestra «No encontramos esta cuenta.» y vuelve a Cuentas', async () => {
    await renderProfile(apiOf([apiError(404, IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND)]));

    expect(screen.getByRole('heading', { name: 'No encontramos esta cuenta.' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Volver a cuentas' })).toBeTruthy();
  });

  it('CA-17: error con «Reintentar», que vuelve a pedir la ficha', async () => {
    const api = apiOf([new TypeError('Failed to fetch'), accountItem()]);
    await renderProfile(api);

    const alert = screen.getByRole('alert');
    expect(alert.textContent).toContain('No pudimos cargar la cuenta.');
    await userEvent.click(within(alert).getByRole('button', { name: 'Reintentar' }));
    await act(async () => undefined);

    expect(screen.getByRole('heading', { level: 1, name: 'Laura Barrios' })).toBeTruthy();
  });

  it('CA-14: un 403 muestra la pantalla común «Sin permiso»', async () => {
    await renderProfile(apiOf([apiError(403, SHARED_ERROR_CODES.FORBIDDEN)]));

    expect(screen.getByRole('heading', { name: 'Sin permiso' })).toBeTruthy();
  });
});
