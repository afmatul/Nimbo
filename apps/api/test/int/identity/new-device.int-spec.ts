import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';

import request from 'supertest';
import { DataSource } from 'typeorm';

import { FixedClock, I_CLOCK } from '../../../src/shared';
import { deleteAll, getMessage, listMessages } from '../setup/mailpit';
import type { TestApp } from '../setup/test-app';
import { waitForLog } from '../setup/wait-for-log';

import { ACCOUNT_PASSWORD, cookieHeader, insertAccount, LOGIN_PATH, setCookie } from './accounts';
import type { Account } from './accounts';
import {
  NEW_DEVICE_MAIL_SUBJECT,
  NEW_DEVICE_MAIL_TAG,
  newDeviceEventsFor,
  newDeviceMailsEnqueuedFor,
} from './device-mail-logs';
import {
  createIdentityTestApp,
  firstMessageTo,
  validRegistration,
  verificationTokenSentTo,
} from './identity-test-app';

const REGISTER = '/api/v1/auth/register';
const VERIFY_EMAIL = '/api/v1/auth/verify-email';
const SECURITY_PATH = '/cuenta/seguridad';
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:130.0) Gecko/20100101 Firefox/130.0';
/** 18:05 UTC es 12:05 en Guatemala (UTC-6, sin horario de verano). */
const SIGNED_IN_AT = new Date('2026-10-04T18:05:00Z');
const GUATEMALA_DATE = '04/10/2026';
const GUATEMALA_TIME = '12:05';

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

/** Secreto de `nimbo_did` bien formado (43 caracteres base64url) que ninguna cuenta ha visto. */
const unseenDeviceSecret = (): string => randomBytes(32).toString('base64url');

interface LoginOptions {
  readonly deviceSecret?: string;
  readonly ip?: string;
}

/** CA-16: aviso de dispositivo nuevo (D-4, RF-04). La app escucha en un puerto para la prueba concurrente. */
describe('aviso de inicio de sesión desde un dispositivo nuevo (CA-16)', () => {
  const clock = new FixedClock(SIGNED_IN_AT);
  let testApp: TestApp;
  let dataSource: DataSource;
  let baseUrl: string;
  let nextIp = 0;

  const freshIp = (): string => `198.51.100.${String((nextIp += 1) % 250)}`;

  const login = (account: Account, { deviceSecret, ip = freshIp() }: LoginOptions = {}) => {
    const call = request(baseUrl)
      .post(LOGIN_PATH)
      .set('User-Agent', USER_AGENT)
      .set('X-Forwarded-For', ip);
    const withCookie =
      deviceSecret === undefined
        ? call
        : call.set('Cookie', cookieHeader({ nimbo_did: deviceSecret }));
    return withCookie.send({ email: account.email, password: ACCOUNT_PASSWORD });
  };

  const devicesOf = async (userId: string): Promise<{ id: string; huella_hash: string }[]> =>
    (await dataSource.query('SELECT id, huella_hash FROM dispositivo WHERE usuario_id = $1', [
      userId,
    ])) as { id: string; huella_hash: string }[];

  const newDeviceMailsInMailpit = async (email: string) =>
    (await listMessages()).filter(
      (message) =>
        message.Subject === NEW_DEVICE_MAIL_SUBJECT &&
        message.To.some((recipient) => recipient.Address === email),
    );

  /** Espera a que el `worker` entregue el aviso de `userId`, para contar lo que llegó a Mailpit. */
  const newDeviceMailDelivered = (userId: string) =>
    waitForLog(
      testApp.logs,
      (line) =>
        line.event === 'mail.sent' &&
        line.tag === NEW_DEVICE_MAIL_TAG &&
        line.recipientId === userId,
    );

  beforeAll(async () => {
    testApp = await createIdentityTestApp({ overrides: [{ provide: I_CLOCK, useValue: clock }] });
    dataSource = testApp.app.get(DataSource);
    await testApp.app.listen(0, '127.0.0.1');
    const address = (testApp.app.getHttpServer() as { address(): AddressInfo }).address();
    baseUrl = `http://127.0.0.1:${String(address.port)}`;
  });

  afterAll(async () => {
    await testApp.close();
  });

  beforeEach(async () => {
    await deleteAll();
    testApp.logs.clear();
    clock.set(SIGNED_IN_AT);
  });

  it('CA-16: un navegador nuevo recibe «Nuevo inicio de sesión en Nimbo» con navegador, sistema, fecha y hora de Guatemala y enlace a Seguridad', async () => {
    const account = await insertAccount(dataSource);
    const ip = freshIp();

    const response = await login(account, { ip });

    expect(response.status).toBe(200);
    const summary = await firstMessageTo(account.email, NEW_DEVICE_MAIL_SUBJECT);
    const message = await getMessage(summary.ID);
    const securityUrl = `${testApp.env.WEB_PUBLIC_URL}${SECURITY_PATH}`;
    expect(message.Text).toContain(
      `el ${GUATEMALA_DATE} a las ${GUATEMALA_TIME} (hora de Guatemala)`,
    );
    expect(message.Text).toContain('desde Firefox en Windows');
    expect(message.Text).toContain(securityUrl);
    expect(message.HTML).toContain(`href="${securityUrl}"`);
    expect(`${message.Text}${message.HTML}`).not.toContain(ip);
    expect(`${message.Text}${message.HTML}`).not.toContain(USER_AGENT);
  });

  it('CA-16: el aviso queda en la bitácora como `identity.device.new` con el `id` de la fila de `dispositivo`', async () => {
    const account = await insertAccount(dataSource);

    await login(account).expect(200);

    const [device] = await devicesOf(account.id);
    expect(newDeviceEventsFor(testApp.logs, account.id)).toEqual([
      expect.objectContaining({ deviceId: device?.id }),
    ]);
    expect(newDeviceMailsEnqueuedFor(testApp.logs, account.id)).toHaveLength(1);
  });

  it('CA-16: desde el mismo navegador (misma `nimbo_did`) no hay aviso', async () => {
    const account = await insertAccount(dataSource);
    const first = await login(account).expect(200);
    const deviceSecret = setCookie(first.headers, 'nimbo_did')?.value ?? '';
    testApp.logs.clear();

    const second = await login(account, { deviceSecret });

    expect(second.status).toBe(200);
    expect(newDeviceMailsEnqueuedFor(testApp.logs, account.id)).toEqual([]);
    expect(newDeviceEventsFor(testApp.logs, account.id)).toEqual([]);
    expect(testApp.logs.lines()).toContainEqual(
      expect.objectContaining({
        event: 'identity.login.succeeded',
        userId: account.id,
        newDevice: false,
      }),
    );
    await expect(devicesOf(account.id)).resolves.toHaveLength(1);
  });

  it('CA-16: el navegador donde se verificó el correo no recibe aviso al verificar (D-4)', async () => {
    const email = `nuevo-${randomUUID()}@nimbo.me`;
    await request(baseUrl)
      .post(REGISTER)
      .set('X-Forwarded-For', freshIp())
      .send(validRegistration(email))
      .expect(202);
    const token = await verificationTokenSentTo(email);
    testApp.logs.clear();

    const verified = await request(baseUrl)
      .post(VERIFY_EMAIL)
      .set('User-Agent', USER_AGENT)
      .send({ token })
      .expect(200);

    expect(setCookie(verified.headers, 'nimbo_did')).toBeDefined();
    const [user] = (await dataSource.query('SELECT id FROM usuario WHERE correo = $1', [
      email,
    ])) as { id: string }[];
    const userId = user?.id ?? '';
    await expect(devicesOf(userId)).resolves.toHaveLength(1);
    expect(newDeviceEventsFor(testApp.logs, userId)).toEqual([]);
    expect(newDeviceMailsEnqueuedFor(testApp.logs, userId)).toEqual([]);
  });

  it('CA-16: un navegador que otra cuenta ya conoce es nuevo para esta (D-4: «nuevo» es por cuenta)', async () => {
    const other = await insertAccount(dataSource);
    const account = await insertAccount(dataSource);
    const first = await login(other).expect(200);
    const deviceSecret = setCookie(first.headers, 'nimbo_did')?.value ?? '';

    await login(account, { deviceSecret }).expect(200);

    expect(newDeviceMailsEnqueuedFor(testApp.logs, account.id)).toHaveLength(1);
    const [device] = await devicesOf(account.id);
    expect(device?.huella_hash).toBe(sha256Hex(deviceSecret));
  });

  it('CA-16: dos inicios simultáneos desde el mismo navegador nuevo dejan un dispositivo y un solo correo', async () => {
    const account = await insertAccount(dataSource);
    const deviceSecret = unseenDeviceSecret();

    const responses = await Promise.all([
      login(account, { deviceSecret }),
      login(account, { deviceSecret }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([200, 200]);
    const devices = await devicesOf(account.id);
    expect(devices).toEqual([expect.objectContaining({ huella_hash: sha256Hex(deviceSecret) })]);
    const succeeded = testApp.logs
      .lines()
      .filter((line) => line.event === 'identity.login.succeeded' && line.userId === account.id);
    expect(succeeded.map((line) => line.newDevice).sort()).toEqual([false, true]);
    expect(newDeviceEventsFor(testApp.logs, account.id)).toHaveLength(1);
    expect(newDeviceMailsEnqueuedFor(testApp.logs, account.id)).toHaveLength(1);
    await newDeviceMailDelivered(account.id);
    await expect(newDeviceMailsInMailpit(account.email)).resolves.toHaveLength(1);
  });
});
