import * as contracts from '..';

import { FIELD_ISSUE_REASONS, IDENTITY_FIELD_MESSAGES, type FieldIssueReason } from './error-codes';
import { LEGAL_DOCUMENTS, SUPPORT_CONTACT_EMAIL } from './legal';
import {
  ACCESS_TOKEN_TTL_SECONDS,
  ACCOUNT_SETUP_LINK_TTL_HOURS,
  DEVICE_COOKIE_MAX_AGE_DAYS,
  EMAIL_REQUEST_COOLDOWN_SECONDS,
  EMAIL_REQUESTS_PER_HOUR,
  FULL_NAME_MAX_LENGTH,
  LOGIN_ATTEMPTS_PER_IP,
  LOGIN_FAILURE_WINDOW_MINUTES,
  LOGIN_IP_WINDOW_MINUTES,
  LOGIN_LOCK_MINUTES,
  LOGIN_MAX_FAILURES,
  MAX_AVISOS_INTENTO_24H,
  PASSWORD_CHANGE_LOCK_MINUTES,
  PASSWORD_CHANGE_MAX_FAILURES,
  PASSWORD_CHANGE_WINDOW_MINUTES,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  REFRESH_ROTATION_GRACE_SECONDS,
  REGISTRATIONS_PER_IP_PER_HOUR,
  RESENDS_PER_IP_PER_HOUR,
  RESET_LINK_TTL_MINUTES,
  SESSION_IDLE_TIMEOUT_DAYS,
  SESSION_MAX_LIFETIME_DAYS,
  VERIFICATION_LINK_TTL_HOURS,
} from './parameters';
import * as parameters from './parameters';

describe('parámetros de identity (spec §6)', () => {
  it('CA-1/CA-15: fija los valores de la spec', () => {
    expect({
      VERIFICATION_LINK_TTL_HOURS,
      EMAIL_REQUEST_COOLDOWN_SECONDS,
      EMAIL_REQUESTS_PER_HOUR,
      REGISTRATIONS_PER_IP_PER_HOUR,
      RESENDS_PER_IP_PER_HOUR,
      MAX_AVISOS_INTENTO_24H,
      FULL_NAME_MAX_LENGTH,
      PASSWORD_MIN_LENGTH,
      PASSWORD_MAX_LENGTH,
    }).toEqual({
      VERIFICATION_LINK_TTL_HOURS: 24,
      EMAIL_REQUEST_COOLDOWN_SECONDS: 60,
      EMAIL_REQUESTS_PER_HOUR: 5,
      REGISTRATIONS_PER_IP_PER_HOUR: 10,
      RESENDS_PER_IP_PER_HOUR: 10,
      MAX_AVISOS_INTENTO_24H: 1,
      FULL_NAME_MAX_LENGTH: 100,
      PASSWORD_MIN_LENGTH: 12,
      PASSWORD_MAX_LENGTH: 1024,
    });
  });
});

describe('parámetros de sesión y recuperación (spec 002 §6)', () => {
  it('CA-1/CA-5/CA-6/CA-8/CA-9/CA-23: fija los valores de la spec', () => {
    expect({
      ACCESS_TOKEN_TTL_SECONDS,
      SESSION_IDLE_TIMEOUT_DAYS,
      SESSION_MAX_LIFETIME_DAYS,
      REFRESH_ROTATION_GRACE_SECONDS,
      LOGIN_MAX_FAILURES,
      LOGIN_FAILURE_WINDOW_MINUTES,
      LOGIN_LOCK_MINUTES,
      LOGIN_ATTEMPTS_PER_IP,
      LOGIN_IP_WINDOW_MINUTES,
      RESET_LINK_TTL_MINUTES,
      PASSWORD_CHANGE_MAX_FAILURES,
      PASSWORD_CHANGE_WINDOW_MINUTES,
      PASSWORD_CHANGE_LOCK_MINUTES,
      DEVICE_COOKIE_MAX_AGE_DAYS,
    }).toEqual({
      ACCESS_TOKEN_TTL_SECONDS: 900,
      SESSION_IDLE_TIMEOUT_DAYS: 7,
      SESSION_MAX_LIFETIME_DAYS: 30,
      REFRESH_ROTATION_GRACE_SECONDS: 10,
      LOGIN_MAX_FAILURES: 5,
      LOGIN_FAILURE_WINDOW_MINUTES: 15,
      LOGIN_LOCK_MINUTES: 15,
      LOGIN_ATTEMPTS_PER_IP: 20,
      LOGIN_IP_WINDOW_MINUTES: 15,
      RESET_LINK_TTL_MINUTES: 60,
      PASSWORD_CHANGE_MAX_FAILURES: 5,
      PASSWORD_CHANGE_WINDOW_MINUTES: 15,
      PASSWORD_CHANGE_LOCK_MINUTES: 15,
      DEVICE_COOKIE_MAX_AGE_DAYS: 365,
    });
  });

  it('CA-18: la recuperación no define límites propios (reutiliza los de 001)', () => {
    const recoveryLimits = Object.keys(parameters).filter(
      (name) => name.startsWith('RESET_') || name.startsWith('FORGOT_'),
    );

    expect(recoveryLimits).toEqual(['RESET_LINK_TTL_MINUTES']);
  });
});

describe('parámetros del alta interna (spec 011)', () => {
  it('Q-4: el enlace de alta vence a las 24 horas', () => {
    expect(ACCOUNT_SETUP_LINK_TTL_HOURS).toBe(24);
  });
});

describe('LEGAL_DOCUMENTS', () => {
  it('CA-1/CA-23: Términos y Política de privacidad en versión 1.0, vigentes desde 2026-09-30', () => {
    expect(LEGAL_DOCUMENTS).toEqual({
      terms: { version: '1.0', effectiveDate: '2026-09-30' },
      privacy: { version: '1.0', effectiveDate: '2026-09-30' },
    });
  });
});

describe('SUPPORT_CONTACT_EMAIL', () => {
  it('CA-4: es el correo de contacto de los textos legales (001 plan §6.13)', () => {
    expect(SUPPORT_CONTACT_EMAIL).toBe('amatultab@gmail.com');
  });

  it('CA-4: es la única constante de correo de contacto de contracts', () => {
    const contactEmails = Object.keys(contracts).filter((name) => name.includes('CONTACT'));

    expect(contactEmails).toEqual(['SUPPORT_CONTACT_EMAIL']);
  });
});

describe('IDENTITY_FIELD_MESSAGES', () => {
  it.each<[FieldIssueReason, string]>([
    ['INVALID_EMAIL', 'Escribe un correo válido, por ejemplo nombre@dominio.com.'],
    [
      'TERMS_NOT_ACCEPTED',
      'Para crear tu cuenta, acepta los Términos y la Política de privacidad.',
    ],
    ['PASSWORD_COMMON', 'Esta contraseña es muy común y fácil de adivinar.'],
    ['PASSWORD_EQUALS_EMAIL', 'Tu contraseña no puede ser tu correo.'],
    ['PASSWORD_TOO_SHORT', '12 caracteres o más'],
    ['PASSWORD_MISSING_UPPERCASE', 'Una mayúscula'],
    ['PASSWORD_MISSING_NUMBER', 'Un número'],
    ['PASSWORD_MISSING_SYMBOL', 'Un símbolo'],
    ['WRONG_PASSWORD', 'La contraseña actual no es correcta.'],
  ])('CA-5/CA-6/CA-23: el mensaje de %s es el texto de spec §11', (reason, message) => {
    expect(IDENTITY_FIELD_MESSAGES[reason]).toBe(message);
  });

  it('CA-6: todo `reason` tiene un mensaje en español no vacío', () => {
    for (const reason of FIELD_ISSUE_REASONS) {
      expect(IDENTITY_FIELD_MESSAGES[reason].length).toBeGreaterThan(0);
    }
  });
});
