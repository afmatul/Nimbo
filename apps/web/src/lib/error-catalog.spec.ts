import {
  IDENTITY_ERROR_CODES,
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
  folderNameConflictMessage,
  folderNameFieldMessage,
  messageForCode,
  messageForReason,
  storageMessage,
} from './error-catalog';

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
          'notas.md',
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
});
