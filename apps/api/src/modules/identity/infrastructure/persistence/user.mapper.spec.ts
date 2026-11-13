import { Role } from '../../../../shared';
import { aClientUser } from '../../application/testing/client-user.builder';
import { AccountStatus } from '../../domain/account-status.enum';
import { ClientUser } from '../../domain/client-user.entity';
import { InternalUser } from '../../domain/internal-user.entity';

import { toInternalUsuarioRow, toUserDomain, toUsuarioRow } from './user.mapper';
import type { UsuarioRow } from './user.mapper';

const PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aW50ZXJuYQ';

const anInternalRow = (): UsuarioRow => ({
  id: '0b7d4c1e-5f6a-4b8c-9d0e-1f2a3b4c5d6e',
  nombre: 'Soporte Nimbo',
  correo: 'soporte@nimbo.me',
  hashClave: PHC,
  rol: Role.SUPPORT,
  estado: AccountStatus.ACTIVE,
  correoVerificado: true,
  versionTerminos: null,
  versionPrivacidad: null,
  terminosAceptadosEn: null,
  codigoEmpleado: 'SOP-001',
  planPendienteSlug: null,
});

describe('user.mapper', () => {
  it('CA-3: un cliente va y vuelve de la fila sin perder datos', () => {
    const user = aClientUser().verified().build();

    const back = toUserDomain(toUsuarioRow(user));

    expect(back).toBeInstanceOf(ClientUser);
    expect(back).toEqual(user);
  });

  it('CA-3: `toUsuarioRow` escribe las columnas del E-R', () => {
    const user = aClientUser().build();

    expect(toUsuarioRow(user)).toEqual({
      id: user.id,
      nombre: user.fullName,
      correo: 'ana@ejemplo.com',
      hashClave: user.passwordHash.reveal(),
      rol: Role.CLIENT,
      estado: AccountStatus.ACTIVE,
      correoVerificado: false,
      versionTerminos: '1.0',
      versionPrivacidad: '1.0',
      terminosAceptadosEn: user.acceptance.acceptedAt,
      codigoEmpleado: null,
      planPendienteSlug: null,
    });
  });

  it('registro con plan: el plan pendiente va y vuelve de `plan_pendiente_slug`', () => {
    const user = aClientUser().withPendingPlan('pro').build();

    const row = toUsuarioRow(user);

    expect(row.planPendienteSlug).toBe('pro');
    expect(toUserDomain(row)).toEqual(user);
  });

  it('CA-3: una fila de rol interno se lee como `InternalUser`', () => {
    const user = toUserDomain(anInternalRow());

    expect(user).toBeInstanceOf(InternalUser);
    expect(user).toMatchObject({ role: Role.SUPPORT, emailVerified: true });
  });

  it('011 RN-5: una fila interna trae su código de empleado; sin código es un dato corrupto y lanza', () => {
    const user = toUserDomain(anInternalRow()) as InternalUser;

    expect(user.employeeCode.value).toBe('SOP-001');
    expect(() => toUserDomain({ ...anInternalRow(), codigoEmpleado: null })).toThrow(TypeError);
  });

  it('011 CA-5: una interna va y vuelve de la fila sin perder datos (sin aceptación, con código)', () => {
    const user = toUserDomain(anInternalRow()) as InternalUser;

    expect(toInternalUsuarioRow(user)).toEqual(anInternalRow());
  });

  it('CA-3: una fila de cliente sin aceptación es un dato corrupto y lanza', () => {
    const row = { ...anInternalRow(), rol: Role.CLIENT, codigoEmpleado: null };

    expect(() => toUserDomain(row)).toThrow(TypeError);
  });

  it('CA-19: la cuenta leída no expone el hash al serializarse', () => {
    const user = toUserDomain(anInternalRow());

    expect(JSON.stringify(user)).not.toContain(PHC);
  });
});
