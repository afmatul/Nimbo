import { Role } from '../../../../shared';
import { ClientUser } from '../../domain/client-user.entity';
import { EmailAddress } from '../../domain/email-address.vo';
import { InternalUser } from '../../domain/internal-user.entity';
import { LegalAcceptance } from '../../domain/legal-acceptance.vo';
import { PasswordHash } from '../../domain/password-hash.vo';
import type { User } from '../../domain/user.entity';

import type { UsuarioOrmEntity } from './usuario.orm-entity';

/** `ClientUser` o `InternalUser` según `rol` (design-model M1, herencia de tabla única). */
export function toUserDomain(row: UsuarioOrmEntity): User {
  const common = {
    id: row.id,
    fullName: row.nombre,
    email: EmailAddress.of(row.correo),
    passwordHash: PasswordHash.fromPhc(row.hashClave),
    status: row.estado,
    emailVerified: row.correoVerificado,
  };
  if (row.rol !== Role.CLIENT) {
    return InternalUser.rehydrate({ ...common, role: row.rol });
  }
  return ClientUser.rehydrate({ ...common, acceptance: toAcceptance(row) });
}

/** Fila completa de un cliente; `identity` nunca escribe cuentas internas (las crea 011). */
export function toUsuarioRow(user: ClientUser): UsuarioOrmEntity {
  return {
    id: user.id,
    nombre: user.fullName,
    correo: user.email.value,
    hashClave: user.passwordHash.reveal(),
    rol: Role.CLIENT,
    estado: user.status,
    correoVerificado: user.emailVerified,
    versionTerminos: user.acceptance.termsVersion,
    versionPrivacidad: user.acceptance.privacyVersion,
    terminosAceptadosEn: user.acceptance.acceptedAt,
  };
}

/** `ck_usuario_aceptacion_cliente` impide un cliente sin aceptación; si aparece, es un dato corrupto. */
function toAcceptance(row: UsuarioOrmEntity): LegalAcceptance {
  if (
    row.versionTerminos === null ||
    row.versionPrivacidad === null ||
    row.terminosAceptadosEn === null
  ) {
    throw new TypeError(`La cuenta de cliente ${row.id} no tiene aceptación de términos.`);
  }
  return LegalAcceptance.of({
    termsVersion: row.versionTerminos,
    privacyVersion: row.versionPrivacidad,
    acceptedAt: row.terminosAceptadosEn,
  });
}
