/** Formato de `ck_usuario_codigo_empleado_formato` (011 plan §3, Q-4): 1 a 20 letras mayúsculas, dígitos o guiones. */
const EMPLOYEE_CODE_PATTERN = /^[A-Z0-9-]{1,20}$/;

/**
 * Código de empleado de una cuenta interna (spec 011 RN-5, DF-33): recortado y en mayúsculas. El formato lo valida
 * antes el esquema de `contracts`; aquí es la segunda barrera, así que uno inválido es un error de programación.
 */
export class EmployeeCode {
  private constructor(readonly value: string) {}

  static of(raw: string): EmployeeCode {
    const value = raw.trim().toUpperCase();
    if (!EMPLOYEE_CODE_PATTERN.test(value)) {
      throw new TypeError('El código de empleado debe tener de 1 a 20 letras, números o guiones.');
    }
    return new EmployeeCode(value);
  }

  equals(other: EmployeeCode): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
