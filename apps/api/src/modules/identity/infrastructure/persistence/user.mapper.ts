import { Role } from '../../../../shared';
import { ClientUser } from '../../domain/client-user.entity';
import { EmailAddress } from '../../domain/email-address.vo';
import { EmployeeCode } from '../../domain/employee-code.vo';
import { InternalUser } from '../../domain/internal-user.entity';
import { LegalAcceptance } from '../../domain/legal-acceptance.vo';
import { PasswordHash } from '../../domain/password-hash.vo';
import type { User } from '../../domain/user.entity';

import type { UsuarioOrmEntity } from './usuario.orm-entity';

/** Columnas de `usuario` que `identity` lee y escribe: `espacio_usado` es de `storage` (005 D-5, DF-59). */
export type UsuarioRow = Omit<UsuarioOrmEntity, 'espacioUsadoBytes'>;

/** `ClientUser` o `InternalUser` según `rol` (design-model M1, herencia de tabla única). */
export function toUserDomain(row: UsuarioRow): User {
  const common = {
    id: row.id,
    fullName: row.nombre,
    email: EmailAddress.of(row.correo),
    passwordHash: PasswordHash.fromPhc(row.hashClave),
    status: row.estado,
    emailVerified: row.correoVerificado,
  };
  if (row.rol !== Role.CLIENT) {
    return InternalUser.rehydrate({ ...common, role: row.rol, employeeCode: toEmployeeCode(row) });
  }
  return ClientUser.rehydrate({ ...common, acceptance: toAcceptance(row) });
}

/** Fila completa de un cliente: sin código de empleado, que solo tienen las internas (011 RN-5). */
export function toUsuarioRow(user: ClientUser): UsuarioRow {
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
    codigoEmpleado: null,
  };
}

/** Fila completa de una interna (011 CA-5): sin aceptación legal y con su código de empleado. */
export function toInternalUsuarioRow(user: InternalUser): UsuarioRow {
  return {
    id: user.id,
    nombre: user.fullName,
    correo: user.email.value,
    hashClave: user.passwordHash.reveal(),
    rol: user.role,
    estado: user.status,
    correoVerificado: user.emailVerified,
    versionTerminos: null,
    versionPrivacidad: null,
    terminosAceptadosEn: null,
    codigoEmpleado: user.employeeCode.value,
  };
}

/** `ck_usuario_codigo_empleado_interna` impide una interna sin código; si aparece, es un dato corrupto. */
function toEmployeeCode(row: UsuarioRow): EmployeeCode {
  if (row.codigoEmpleado === null) {
    throw new TypeError(`La cuenta interna ${row.id} no tiene código de empleado.`);
  }
  return EmployeeCode.of(row.codigoEmpleado);
}

/** `ck_usuario_aceptacion_cliente` impide un cliente sin aceptación; si aparece, es un dato corrupto. */
function toAcceptance(row: UsuarioRow): LegalAcceptance {
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
