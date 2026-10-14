import { randomUUID } from 'node:crypto';

/** Prefijo de los códigos de empleado de prueba: con 12 hexadecimales queda en 14 caracteres (máximo 20, RN-5). */
const TEST_CODE_PREFIX = 'E-';
const TEST_CODE_HEX_LENGTH = 12;

/** Código de empleado único, en mayúsculas y con el formato de `ck_usuario_codigo_empleado_formato` (011 plan §3). */
export const uniqueEmployeeCode = (): string =>
  `${TEST_CODE_PREFIX}${randomUUID().replaceAll('-', '').slice(0, TEST_CODE_HEX_LENGTH).toUpperCase()}`;

/** Las internas llevan un código único; los clientes, ninguno (`ck_usuario_codigo_empleado_*`). */
export const employeeCodeFor = (role: string): string | null =>
  role === 'CLIENT' ? null : uniqueEmployeeCode();
