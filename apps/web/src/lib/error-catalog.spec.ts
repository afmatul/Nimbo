import {
  BILLING_ERROR_CODES,
  BACKOFFICE_ERROR_CODES,
  BACKOFFICE_FIELD_ISSUE_REASONS,
  BACKOFFICE_FIELD_MESSAGES,
  IDENTITY_ERROR_CODES,
  INTELLIGENCE_ERROR_CODES,
  IDENTITY_FIELD_MESSAGES,
  LOGIN_LOCK_MINUTES,
  SHARED_ERROR_CODES,
  STORAGE_ERROR_CODES,
  STORAGE_NODE_FIELD_MESSAGES,
  SUPPORT_CONTACT_EMAIL,
  quickAccessLimitMessage,
} from '@nimbo/contracts';

import { ApiClientError } from './api-error';
import {
  IDENTITY_FIELD_MESSAGES as reexported,
  agentMessage,
  backofficeFieldMessage,
  enrollmentFieldMessage,
  folderNameConflictMessage,
  folderNameFieldMessage,
  messageForCode,
  messageForReason,
  quotaBelowUsageMessage,
  storageMessage,
  validityNotLaterMessage,
} from './error-catalog';
import { formatCount } from './format-plan';

describe('error-catalog', () => {
  it('reexporta IDENTITY_FIELD_MESSAGES y resuelve cada reason', () => {
    expect(reexported).toBe(IDENTITY_FIELD_MESSAGES);
    expect(messageForReason('REQUIRED')).toBe(IDENTITY_FIELD_MESSAGES.REQUIRED);
    expect(messageForReason('PASSWORD_TOO_SHORT')).toBe('12 caracteres o más');
  });

  it('resuelve cada code de identity', () => {
    expect(messageForCode(IDENTITY_ERROR_CODES.INVALID_INPUT)).toContain('campos marcados');
    expect(messageForCode(IDENTITY_ERROR_CODES.WEAK_PASSWORD)).toContain('requisitos');
    expect(messageForCode(IDENTITY_ERROR_CODES.VERIFICATION_LINK_EXPIRED)).toContain('venció');
    expect(messageForCode(IDENTITY_ERROR_CODES.VERIFICATION_LINK_INVALID)).toContain(
      'no es válido',
    );
    expect(
      messageForCode(IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS, { retryAfterSeconds: 120 }),
    ).toContain('2 minutos');
  });

  it('un código desconocido cae en el genérico de 000 §10', () => {
    expect(messageForCode('NO_EXISTE', { correlationId: 'abc' })).toBe(
      'Ocurrió un error inesperado. Intenta de nuevo; si persiste, comparte este código con soporte: abc',
    );
    expect(messageForReason('OTRO', 'abc')).toContain('abc');
  });

  describe('códigos de 002 (spec §11)', () => {
    it('CA-2: credenciales inválidas', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.INVALID_CREDENTIALS)).toBe(
        'El correo o la contraseña no son correctos. Revísalos o restablece tu contraseña.',
      );
    });

    it('CA-3: cuenta no verificada con la acción de 001 CA-16', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.EMAIL_NOT_VERIFIED)).toBe(
        'Verifica tu correo con el enlace que te enviamos; si venció, pide uno nuevo.',
      );
    });

    it('CA-4: cuenta suspendida con SUPPORT_CONTACT_EMAIL', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.ACCOUNT_SUSPENDED)).toBe(
        `Tu cuenta está suspendida. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
      );
    });

    it('CA-5: bloqueo con los minutos de Retry-After, redondeados hacia arriba', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.LOGIN_LOCKED, { retryAfterSeconds: 601 })).toBe(
        'Hubo demasiados intentos fallidos. Espera 11 minutos o restablece tu contraseña.',
      );
      expect(messageForCode(IDENTITY_ERROR_CODES.LOGIN_LOCKED)).toContain(
        `Espera ${String(LOGIN_LOCK_MINUTES)} minutos`,
      );
    });

    it('CA-6 (DT-20): el límite por IP del inicio de sesión tiene su propio texto', () => {
      expect(
        messageForCode(IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS, {
          retryAfterSeconds: 120,
          screen: 'login',
        }),
      ).toBe('Hiciste demasiados intentos. Espera unos minutos y vuelve a intentarlo.');
    });

    it('CA-18 (DT-20): fuera del inicio de sesión se conserva el texto de 001', () => {
      expect(
        messageForCode(IDENTITY_ERROR_CODES.TOO_MANY_REQUESTS, { retryAfterSeconds: 60 }),
      ).toContain('Ya te enviamos un enlace hace poco');
    });

    it('CA-8 y CA-9: sesión terminada, revocada o inválida', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.SESSION_EXPIRED)).toBe(
        'Tu sesión terminó. Inicia sesión de nuevo.',
      );
      expect(messageForCode(IDENTITY_ERROR_CODES.SESSION_REVOKED)).toBe(
        'Tu sesión se cerró. Inicia sesión de nuevo.',
      );
      expect(messageForCode(IDENTITY_ERROR_CODES.REFRESH_INVALID)).toBe(
        'Tu sesión no es válida. Inicia sesión de nuevo.',
      );
    });

    it('CA-20: enlaces de recuperación', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.RESET_LINK_EXPIRED)).toBe(
        'Este enlace venció. Pide uno nuevo y úsalo en la próxima hora.',
      );
      expect(messageForCode(IDENTITY_ERROR_CODES.RESET_LINK_INVALID)).toBe(
        'Este enlace no es válido. Usa el enlace del correo más reciente o pide uno nuevo.',
      );
    });

    it('011 CA-5: enlaces de alta interna, con el mismo texto que el servidor y sin pedir un enlace nuevo', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.SETUP_LINK_EXPIRED)).toBe(
        'Este enlace venció. Usa «¿Olvidaste tu contraseña?» en el inicio de sesión para crear tu contraseña.',
      );
      expect(messageForCode(IDENTITY_ERROR_CODES.SETUP_LINK_INVALID)).toBe(
        'Este enlace no es válido o ya se usó. Si ya creaste tu contraseña, inicia sesión; si no, usa «¿Olvidaste tu contraseña?».',
      );
    });

    it('CA-23: contraseña actual incorrecta y cambio bloqueado', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.WRONG_PASSWORD)).toBe(
        'La contraseña actual no es correcta.',
      );
      expect(
        messageForCode(IDENTITY_ERROR_CODES.PASSWORD_CHANGE_LOCKED, { retryAfterSeconds: 300 }),
      ).toBe(
        'Hiciste demasiados intentos con una contraseña incorrecta. Espera 5 minutos o restablece tu contraseña.',
      );
    });

    it('sesión ajena o inexistente', () => {
      expect(messageForCode(IDENTITY_ERROR_CODES.SESSION_NOT_FOUND)).toBe(
        'No encontramos esa sesión. Actualiza la lista.',
      );
    });
  });

  describe('códigos de storage (005 spec §9)', () => {
    it('CA-3: tamaño máximo con las cifras de `details`', () => {
      expect(
        messageForCode(STORAGE_ERROR_CODES.STORAGE_FILE_TOO_LARGE, {
          details: { sizeBytes: 52_400_000, maxBytes: 50_000_000 },
        }),
      ).toBe(
        'Este archivo pesa 52,4 MB y tu plan permite hasta 50 MB por archivo. Reduce su tamaño o cambia de plan.',
      );
    });

    it('CA-4: cuota con lo que falta; ofrece liberar espacio y no «Ver planes»', () => {
      const message = messageForCode(STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED, {
        details: { missingBytes: 1_500_000_000 },
      });

      expect(message).toBe(
        'Te faltan 1,5 GB de espacio para subir este archivo. Libera espacio o cambia de plan.',
      );
      expect(message).not.toContain('Ver planes');
    });

    it('014 CA-12: cuota al restaurar una versión, con el mismo texto que el servidor', () => {
      expect(
        storageMessage(
          STORAGE_ERROR_CODES.STORAGE_QUOTA_EXCEEDED,
          { missingBytes: 1_600_000 },
          { purpose: 'restore' },
        ),
      ).toEqual({
        cause: 'Te faltan 1,6 MB de espacio para restaurar esta versión.',
        fix: 'Libera espacio o cambia de plan.',
      });
    });

    it('CA-5: tamaño distinto al declarado, sin parámetros e idéntico al del servidor', () => {
      expect(messageForCode(STORAGE_ERROR_CODES.STORAGE_UPLOAD_SIZE_MISMATCH)).toBe(
        'El archivo cambió durante la carga. Vuelve a subirlo.',
      );
    });

    it('CA-10, CA-11: tipo inválido con la extensión y ejecutable', () => {
      expect(
        messageForCode(STORAGE_ERROR_CODES.STORAGE_INVALID_FILE_TYPE, {
          details: { reason: 'signature', extension: 'pdf' },
        }),
      ).toBe('Este archivo no es un .pdf válido. Comprueba que sea el archivo correcto.');
      expect(
        messageForCode(STORAGE_ERROR_CODES.STORAGE_INVALID_FILE_TYPE, {
          details: { reason: 'executable', extension: 'exe' },
        }),
      ).toBe('No se permiten archivos ejecutables. Sube otro archivo.');
    });

    it('CA-10: sin `extension` en `details` usa la del nombre del archivo', () => {
      expect(
        storageMessage(
          STORAGE_ERROR_CODES.STORAGE_INVALID_FILE_TYPE,
          { reason: 'text' },
          { fileName: 'notas.md' },
        ),
      ).toEqual({
        cause: 'Este archivo no es un .md válido.',
        fix: 'Comprueba que sea el archivo correcto.',
      });
    });

    it('CA-7, CA-9, CA-19: vacío, caducada y tasa', () => {
      expect(messageForCode(STORAGE_ERROR_CODES.STORAGE_EMPTY_FILE)).toBe(
        'El archivo está vacío. Revisa que tenga contenido y súbelo de nuevo.',
      );
      expect(messageForCode(STORAGE_ERROR_CODES.STORAGE_UPLOAD_EXPIRED)).toBe(
        'Esta carga caducó. Vuelve a subir el archivo.',
      );
      expect(messageForCode(STORAGE_ERROR_CODES.STORAGE_TOO_MANY_REQUESTS)).toBe(
        'Hiciste demasiadas solicitudes. Espera un momento e inténtalo de nuevo.',
      );
    });

    it('CA-21: todo código de storage tiene texto propio, con acción correctiva', () => {
      for (const code of Object.values(STORAGE_ERROR_CODES)) {
        const message = messageForCode(code, { correlationId: 'abc' });

        expect(message).not.toContain('abc');
        expect(message).toMatch(/\.$/);
      }
    });

    it('un código ajeno a storage no tiene mensaje estructurado', () => {
      expect(storageMessage('NO_EXISTE')).toBeNull();
    });
  });

  describe('carpetas (006 spec §3)', () => {
    it('CA-3: nombre repetido de carpeta con el nombre guardado', () => {
      expect(folderNameConflictMessage('Prompts')).toBe(
        'Ya existe una carpeta llamada «Prompts» aquí. Elige otro nombre.',
      );
    });

    it('CA-2: mensajes del campo de nombre por `reason`', () => {
      expect(folderNameFieldMessage('REQUIRED')).toBe('Escribe un nombre para la carpeta.');
      expect(folderNameFieldMessage('NAME_TOO_LONG')).toBe(
        'El nombre puede tener hasta 255 caracteres.',
      );
      expect(folderNameFieldMessage('INVALID_NAME')).toBe(STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME);
      expect(folderNameFieldMessage('NO_EXISTE')).toBe(STORAGE_NODE_FIELD_MESSAGES.INVALID_NAME);
    });

    it('CA-9: profundidad máxima con la cifra de `details`', () => {
      expect(
        messageForCode(STORAGE_ERROR_CODES.STORAGE_FOLDER_DEPTH_EXCEEDED, {
          details: { maxDepth: 10 },
        }),
      ).toBe('Llegaste al máximo de 10 niveles de carpetas. Crea la carpeta en otro lugar.');
    });

    it('CA-28: el tope de fijados usa la cifra de `details.maxPinned`, como el texto de contracts', () => {
      expect(
        messageForCode(STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT, {
          details: { maxPinned: 5 },
        }),
      ).toBe(quickAccessLimitMessage(5));
      expect(
        messageForCode(STORAGE_ERROR_CODES.STORAGE_QUICK_ACCESS_LIMIT, {
          details: { maxPinned: 8 },
        }),
      ).toBe('Ya fijaste 8 elementos. Quita uno para fijar otro.');
    });

    it('CA-6: un 404 al subir o crear habla de la carpeta de destino, no de un archivo', () => {
      expect(storageMessage(STORAGE_ERROR_CODES.STORAGE_NODE_NOT_FOUND)).toEqual({
        cause: 'No encontramos la carpeta de destino.',
        fix: 'Puede que la hayas movido a la papelera. Elige otra carpeta y vuelve a intentarlo.',
      });
    });
  });

  describe('códigos del cobro (spec 009 §6)', () => {
    it.each([
      [
        BILLING_ERROR_CODES.BILLING_PAYMENT_REJECTED,
        'La tarjeta fue rechazada. No se hizo ningún cargo. Prueba con otra tarjeta.',
      ],
      [
        BILLING_ERROR_CODES.BILLING_PLAN_NOT_AVAILABLE,
        'Este plan no está disponible para contratar. Elige otro plan en Planes.',
      ],
      [
        BILLING_ERROR_CODES.BILLING_INVALID_INPUT,
        'Revisa los datos de pago marcados y corrígelos para continuar.',
      ],
    ])('CA-4, CA-5: %s tiene su mensaje con acción correctiva', (code, message) => {
      expect(messageForCode(code)).toBe(message);
    });

    it('CA-5: el 429 compartido dice cuántos minutos esperar según `Retry-After`', () => {
      expect(messageForCode(SHARED_ERROR_CODES.TOO_MANY_REQUESTS, { retryAfterSeconds: 840 })).toBe(
        'Hiciste demasiados intentos. Espera 14 minutos e inténtalo de nuevo.',
      );
    });
  });

  describe('ajustes de cuota y vigencia (spec 011b §6)', () => {
    it('CA-2: la cuota bajo lo usado nombra lo que la cuenta ya usa, en GB del catálogo', () => {
      expect(quotaBelowUsageMessage(String(108 * 1024 ** 3))).toBe(
        'La cuota total no puede quedar por debajo de lo que la cuenta ya usa (108 GB).',
      );
    });

    it('CA-7: la vigencia que no extiende nombra el último día vigente', () => {
      expect(validityNotLaterMessage('31 oct 2026')).toBe(
        'Solo puedes extender la vigencia: elige un día posterior al 31 oct 2026.',
      );
    });

    it.each([
      [BACKOFFICE_ERROR_CODES.QUOTA_INVALID, 'Revisa el espacio extra'],
      [BACKOFFICE_ERROR_CODES.QUOTA_BELOW_USAGE, 'por debajo de lo que la cuenta ya usa'],
      [BACKOFFICE_ERROR_CODES.VALIDITY_NOT_EXTENDED, 'Solo puedes extender la vigencia'],
      [BACKOFFICE_ERROR_CODES.INVALID_INPUT, 'campos marcados'],
    ])(
      'CA-2, CA-3, CA-7, 011b CA-12: %s tiene texto propio con la acción correctiva',
      (code, text) => {
        expect(messageForCode(code)).toContain(text);
      },
    );
  });

  describe('backoffice (spec 011)', () => {
    it.each(BACKOFFICE_FIELD_ISSUE_REASONS)(
      'CA-13: el motivo %s del campo de búsqueda usa el texto de contracts',
      (reason) => {
        expect(backofficeFieldMessage(reason)).toBe(BACKOFFICE_FIELD_MESSAGES[reason]);
      },
    );

    it('CA-13: un motivo desconocido cae en el genérico de 000 §10', () => {
      expect(backofficeFieldMessage('OTRO', 'abc')).toContain('abc');
    });

    it.each([
      [
        IDENTITY_ERROR_CODES.ACCOUNT_NOT_FOUND,
        'No encontramos esa cuenta. Vuelve a Cuentas y búscala de nuevo.',
      ],
      [
        IDENTITY_ERROR_CODES.CANNOT_CHANGE_OWN_STATUS,
        'No puedes suspender ni reactivar tu propia cuenta. Pídeselo a otro Administrador.',
      ],
      [
        IDENTITY_ERROR_CODES.LAST_ACTIVE_ADMIN,
        'No se puede suspender: debe quedar al menos un Administrador activo. Nada cambió.',
      ],
      [
        IDENTITY_ERROR_CODES.ACCOUNT_STATE_CONFLICT,
        'La cuenta ya cambió de estado. Recarga la ficha para ver su estado actual.',
      ],
      [
        IDENTITY_ERROR_CODES.ENROLLMENT_CONFLICT,
        'Ya existe una cuenta con estos datos. Corrige los campos marcados y vuelve a intentarlo.',
      ],
    ])('CA-2 a CA-6: %s dice qué pasó y qué hacer', (code, message) => {
      expect(messageForCode(code)).toBe(message);
    });

    it.each([
      ['fullName', 'Escribe el nombre completo de la persona.'],
      ['email', 'Escribe el correo de la persona.'],
      ['employeeCode', 'Escribe el código de empleado.'],
      ['role', 'Elige el rol de la cuenta.'],
    ])('CA-6: el alta interna sin %s pide ese dato', (field, message) => {
      expect(enrollmentFieldMessage({ field, reason: 'REQUIRED', message: 'x' })).toBe(message);
    });

    it.each([
      'INVALID_EMAIL',
      'INVALID_EMPLOYEE_CODE',
      'EMAIL_IN_USE',
      'EMPLOYEE_CODE_IN_USE',
    ] as const)('CA-6: el motivo %s del alta usa el texto de contracts', (reason) => {
      expect(enrollmentFieldMessage({ field: 'email', reason, message: 'x' })).toBe(
        IDENTITY_FIELD_MESSAGES[reason],
      );
    });
  });

  describe('códigos de shared (spec 003 D-6, plan §6.2)', () => {
    it('CA-1: sin sesión válida, mensaje en español con la acción de iniciar sesión', () => {
      expect(messageForCode(SHARED_ERROR_CODES.UNAUTHENTICATED)).toBe(
        'Tu sesión no es válida o expiró. Inicia sesión de nuevo.',
      );
    });

    it('CA-17: sin permiso, mensaje en español con la acción de escribir a soporte', () => {
      expect(messageForCode(SHARED_ERROR_CODES.FORBIDDEN)).toBe(
        `Tu cuenta no tiene permiso para esta acción. Si crees que es un error, escríbenos a ${SUPPORT_CONTACT_EMAIL}.`,
      );
    });

    it('CA-1 y CA-17: la web no muestra el message del servidor, solo el de su catálogo', () => {
      const serverMessage = 'Mensaje del servidor que la web no debe mostrar';
      const errors = Object.values(SHARED_ERROR_CODES).map(
        (code) => new ApiClientError({ code, message: serverMessage, correlationId: 'corr-1' }),
      );

      for (const error of errors) {
        const shown = messageForCode(error.code, { correlationId: error.correlationId });
        expect(shown).not.toContain(serverMessage);
        expect(shown).not.toContain(error.correlationId);
      }
    });
  });
  describe('códigos del agente (020b, RNF-14)', () => {
    const {
      AGENT_INVALID_QUESTION,
      AGENT_QUOTA_EXCEEDED,
      AGENT_SCOPE_NOT_FOUND,
      AGENT_UNAVAILABLE,
    } = INTELLIGENCE_ERROR_CODES;

    it('CA-7: pregunta vacía con la corrección y sin descontar la consulta', () => {
      expect(agentMessage(AGENT_INVALID_QUESTION, { reason: 'empty' })).toEqual({
        cause: 'Escribe una pregunta para consultar a tus documentos.',
        fix: 'No se descontó tu consulta.',
      });
    });

    it('CA-7: pregunta larga con los caracteres que sobran y el máximo de la API', () => {
      const details = { reason: 'too_long', excessChars: 124, maxChars: 1000 };

      expect(agentMessage(AGENT_INVALID_QUESTION, details)).toEqual({
        cause: 'Tu pregunta tiene 124 caracteres de más.',
        fix: `Acórtala a ${formatCount(1000)} o menos para enviarla. No se descontó tu consulta.`,
      });
      expect(agentMessage(AGENT_INVALID_QUESTION, { ...details, excessChars: 1 })?.cause).toBe(
        'Tu pregunta tiene 1 carácter de más.',
      );
    });

    it('CA-7: larga sin cifras (solo el motivo del servidor) sigue diciendo qué hacer', () => {
      expect(agentMessage(AGENT_INVALID_QUESTION, { reason: 'too_long' })).toEqual({
        cause: 'Tu pregunta es demasiado larga.',
        fix: 'Acórtala para enviarla. No se descontó tu consulta.',
      });
    });

    it('CA-8: consultas agotadas con el límite del plan y la fecha de renovación', () => {
      const details = { limit: 20, resetsAt: '2026-11-01T12:00:00.000Z' };

      expect(agentMessage(AGENT_QUOTA_EXCEEDED, details)).toEqual({
        cause: 'Usaste tus 20 consultas de este mes. Se renuevan el 1 de noviembre.',
        fix: 'Mientras tanto, subir, descargar y buscar archivos funciona igual.',
      });
    });

    it('CA-8, RN-5: en solo lectura sin fecha, ninguna fecha y la salida es renovar el plan', () => {
      const message = agentMessage(AGENT_QUOTA_EXCEEDED, { limit: 2000 });

      expect(message).toEqual({
        cause: `Usaste tus ${formatCount(2000)} consultas de este mes.`,
        fix: 'Renueva tu plan para volver a preguntar.',
      });
    });

    it('CA-9: no disponible, con archivos a salvo y sin descontar; variante parcial', () => {
      expect(agentMessage(AGENT_UNAVAILABLE)).toEqual({
        cause: 'El agente no está disponible. Tus archivos siguen a salvo.',
        fix: 'No se descontó tu consulta. Inténtalo de nuevo en unos minutos.',
      });
      expect(agentMessage(AGENT_UNAVAILABLE, {}, { partial: true })).toEqual({
        cause: 'El agente no está disponible. Tus archivos siguen a salvo.',
        fix: 'La respuesta se cortó; lo de arriba es lo que alcanzó a llegar. No se descontó tu consulta.',
      });
    });

    it('CA-16: ámbito que ya no existe', () => {
      const message = agentMessage(AGENT_SCOPE_NOT_FOUND);

      expect(`${message?.cause} ${message?.fix}`).toBe(
        'Esa carpeta o archivo ya no está disponible. Elige otro ámbito.',
      );
    });

    it('un code ajeno al agente devuelve null', () => {
      expect(agentMessage(SHARED_ERROR_CODES.FORBIDDEN)).toBeNull();
    });

    it('messageForCode une causa y corrección de los codes del agente', () => {
      expect(messageForCode(AGENT_SCOPE_NOT_FOUND)).toBe(
        'Esa carpeta o archivo ya no está disponible. Elige otro ámbito.',
      );
      expect(messageForCode(AGENT_QUOTA_EXCEEDED, { details: { limit: 20 } })).toBe(
        'Usaste tus 20 consultas de este mes. Renueva tu plan para volver a preguntar.',
      );
    });
  });
});
