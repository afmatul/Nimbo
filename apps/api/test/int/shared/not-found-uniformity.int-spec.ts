import { randomUUID } from 'node:crypto';

import { errorResponseSchema } from '@nimbo/contracts';
import request from 'supertest';
import type { Response } from 'supertest';

import { I_CLOCK, Role } from '../../../src/shared';
import type { FixedClock } from '../../../src/shared';
import { ProbeResources } from '../../support/probe.controller';
import { TestAccessTokens } from '../../support/test-access-tokens';
import { createTestApp } from '../setup/test-app';
import type { TestApp } from '../setup/test-app';

/** Lo que ve quien llama. `date` se omite: es la hora de la respuesta y no depende del recurso. */
const observe = (response: Response) => {
  const { date: _date, ...headers } = response.headers as Record<string, unknown>;
  return { status: response.status, headers, body: response.body as unknown };
};

/**
 * CA-11 (parte de 003, D-6): un recurso de otra cuenta y uno inexistente dan la misma respuesta. Las dos peticiones
 * llevan el mismo `x-correlation-id`, así el cuerpo (que lo incluye) y sus cabeceras derivadas (`ETag`,
 * `Content-Length`) deben coincidir byte a byte. Con archivos reales se repite en 005.
 */
describe('404 uniforme para recursos ajenos o inexistentes (CA-11)', () => {
  let testApp: TestApp;
  let tokens: TestAccessTokens;
  const me = randomUUID();
  const other = randomUUID();

  const getResource = (id: string, correlationId: string): Promise<Response> =>
    request(testApp.app.getHttpServer())
      .get(`/api/v1/__probe/resources/${id}`)
      .set('Authorization', `Bearer ${tokens.forRole(Role.CLIENT, me)}`)
      .set('X-Correlation-Id', correlationId);

  beforeAll(async () => {
    testApp = await createTestApp();
    tokens = new TestAccessTokens(testApp.app.get<FixedClock>(I_CLOCK));
  });

  afterAll(async () => {
    await testApp.close();
  });

  it('CA-11: el recurso de otra cuenta y un UUID inexistente dan el mismo 404, cabeceras y cuerpo', async () => {
    const foreign = testApp.app.get(ProbeResources).add(other);
    const correlationId = randomUUID();

    const ofOther = await getResource(foreign.id, correlationId);
    const missing = await getResource(randomUUID(), correlationId);

    expect(ofOther.status).toBe(404);
    expect(errorResponseSchema.parse(ofOther.body)).toMatchObject({
      code: 'PROBE_RESOURCE_NOT_FOUND',
    });
    expect(observe(ofOther)).toEqual(observe(missing));
  });

  it('CA-11: con un `x-correlation-id` distinto solo cambian ese valor y el `correlationId` del cuerpo', async () => {
    const foreign = testApp.app.get(ProbeResources).add(other);

    const ofOther = observe(await getResource(foreign.id, randomUUID()));
    const missing = observe(await getResource(randomUUID(), randomUUID()));

    const withoutCorrelation = ({ status, headers, body }: ReturnType<typeof observe>) => {
      const { 'x-correlation-id': _id, etag: _etag, ...rest } = headers;
      const { correlationId: _correlationId, ...fields } = body as Record<string, unknown>;
      return { status, headers: rest, body: fields };
    };
    expect(withoutCorrelation(ofOther)).toEqual(withoutCorrelation(missing));
  });

  it('CA-11: el recurso propio responde 200', async () => {
    const own = testApp.app.get(ProbeResources).add(me);

    const response = await getResource(own.id, randomUUID());

    expect(response.status).toBe(200);
    expect(response.body).toEqual(own);
  });
});
