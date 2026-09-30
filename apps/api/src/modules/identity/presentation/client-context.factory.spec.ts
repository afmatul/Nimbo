import { readClientContext } from './client-context.factory';
import { DEVICE_COOKIE } from './session-cookies';

const DEVICE_SECRET = 'AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/140.0 Safari/537.36';

describe('readClientContext (plan §6.5)', () => {
  it('CA-16: toma la cookie de dispositivo, el User-Agent y `req.ip`', () => {
    const req = {
      headers: { cookie: `${DEVICE_COOKIE}=${DEVICE_SECRET}`, 'user-agent': USER_AGENT },
      ip: '203.0.113.7',
    };

    expect(readClientContext(req)).toEqual({
      deviceSecret: DEVICE_SECRET,
      userAgent: USER_AGENT,
      ip: '203.0.113.7',
    });
  });

  it('CA-16: sin cookie, sin User-Agent y sin IP → sin secreto, agente vacío e IP nula', () => {
    expect(readClientContext({ headers: {}, ip: undefined })).toEqual({ userAgent: '', ip: null });
  });

  it('CA-16: no lee nada más de la petición', () => {
    const req = {
      headers: {
        'user-agent': USER_AGENT,
        authorization: 'Bearer x',
        'x-forwarded-for': '198.51.100.1',
      },
      ip: '203.0.113.7',
      body: { email: 'a@b.c' },
    };

    expect(Object.keys(readClientContext(req)).sort()).toEqual(['ip', 'userAgent']);
  });
});
