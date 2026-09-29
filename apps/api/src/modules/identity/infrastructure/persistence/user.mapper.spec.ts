import { Role } from '../../../../shared';
import { aClientUser } from '../../application/testing/client-user.builder';
import { AccountStatus } from '../../domain/account-status.enum';
import { ClientUser } from '../../domain/client-user.entity';
import { InternalUser } from '../../domain/internal-user.entity';

import { toUserDomain, toUsuarioRow } from './user.mapper';
import type { UsuarioOrmEntity } from './usuario.orm-entity';

const PHC = '$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aW50ZXJuYQ';

const anInternalRow = (): UsuarioOrmEntity => ({
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
    });
  });

  it('CA-3: una fila de rol interno se lee como `InternalUser`', () => {
    const user = toUserDomain(anInternalRow());

    expect(user).toBeInstanceOf(InternalUser);
    expect(user).toMatchObject({ role: Role.SUPPORT, emailVerified: true });
  });

  it('CA-3: una fila de cliente sin aceptación es un dato corrupto y lanza', () => {
    const row = { ...anInternalRow(), rol: Role.CLIENT };

    expect(() => toUserDomain(row)).toThrow(TypeError);
  });

  it('CA-19: la cuenta leída no expone el hash al serializarse', () => {
    const user = toUserDomain(anInternalRow());

    expect(JSON.stringify(user)).not.toContain(PHC);
  });
});
