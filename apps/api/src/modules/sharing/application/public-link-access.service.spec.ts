import { createHash } from 'node:crypto';

import type {
  IPasswordHasher,
  IRateLimiter,
  ITransactionRunner,
  RateLimitDecision,
} from '../../../shared';
import { PasswordHash, RateLimitExceededError } from '../../../shared';
import type { IAuditLogger } from '../../audit';
import type { DownloadUrl, LinkedFile } from '../../storage';
import { PublicLinkPasswordInvalidError, PublicLinkUnavailableError } from '../domain/errors';
import { LinkToken } from '../domain/link-token';
import { PublicLink } from '../domain/public-link';

import type { IPublicLinkResolver, ResolvedPublicLink } from './ports/i-public-link-resolver.port';
import type { IPublicLinkRepository } from './ports/i-public-link.repository.port';
import type { IShareeDirectory } from './ports/i-sharee-directory.port';
import { PublicLinkAccessService } from './public-link-access.service';

const TOKEN = LinkToken.generate().toString();
const IP = '2001:db8:aa:bb:1:2:3:4';
const RESOLVED: ResolvedPublicLink = {
  linkId: '44444444-4444-4444-8444-444444444444',
  fileId: '33333333-3333-4333-8333-333333333333',
  ownerId: '11111111-1111-4111-8111-111111111111',
};
const FILE: LinkedFile = { id: RESOLVED.fileId, name: 'Informe.pdf', sizeBytes: 2048n };
const EXPIRES_AT = new Date('2026-11-09T10:00:00.000Z');
const REQUESTS_PER_MINUTE = 30;
const PASSWORD_HASH = PasswordHash.fromPhc('$argon2id$v=19$m=19456,t=2,p=1$c2FsdA$aGFzaA');
const PASSWORD = 'clave-del-enlace-9c2e';
const ISSUED: DownloadUrl = {
  url: 'https://objetos.test/u/firmada',
  expiresAt: new Date('2026-11-02T10:05:00.000Z'),
};
const OWNER = { id: RESOLVED.ownerId, role: 'CLIENT', canReadContent: true };

const availableLink = (passwordHash: PasswordHash | null = null): PublicLink =>
  PublicLink.rehydrate({
    id: RESOLVED.linkId,
    fileId: RESOLVED.fileId,
    ownerId: RESOLVED.ownerId,
    tokenHash: LinkToken.hashOf(TOKEN),
    passwordHash,
    expiresAt: EXPIRES_AT,
    createdAt: new Date('2026-11-02T10:00:00.000Z'),
  });

interface SetupOptions {
  readonly rate?: RateLimitDecision;
  readonly resolved?: ResolvedPublicLink | null;
  readonly sharedBy?: string | null;
  readonly link?: PublicLink | null;
  readonly file?: LinkedFile | null;
  readonly issued?: DownloadUrl | null;
}

const setup = (options: SetupOptions = {}) => {
  const journal: string[] = [];
  const step =
    <T>(name: string, value: T) =>
    (): Promise<T> => {
      journal.push(name);
      return Promise.resolve(value);
    };
  const transactions: ITransactionRunner = {
    run: (work) => {
      journal.push('tx');
      return work();
    },
    withActor: (actor, work) => {
      journal.push(`tx:${actor.role}:${actor.id}`);
      return work();
    },
  };
  const rateLimiter: IRateLimiter = {
    consume: jest.fn(step('rate', options.rate ?? { allowed: true })),
  };
  const resolver: IPublicLinkResolver = {
    resolve: jest.fn(step('resolve', options.resolved === undefined ? RESOLVED : options.resolved)),
  };
  const directory = {
    activeDisplayName: jest.fn(
      step('activeDisplayName', options.sharedBy === undefined ? 'Ana Ruiz' : options.sharedBy),
    ),
  } as Pick<IShareeDirectory, 'activeDisplayName'>;
  const links = {
    findAvailable: jest.fn(
      step('findAvailable', options.link === undefined ? availableLink() : options.link),
    ),
  } as Pick<IPublicLinkRepository, 'findAvailable'>;
  const files = {
    findOwnedFile: jest.fn(step('findOwnedFile', options.file === undefined ? FILE : options.file)),
    issueDownload: jest.fn(
      step('issueDownload', options.issued === undefined ? ISSUED : options.issued),
    ),
  };
  const hasher: IPasswordHasher = {
    hash: jest.fn(),
    verify: jest.fn((_hash: PasswordHash, plain: string) => {
      journal.push('verify');
      return Promise.resolve(plain === PASSWORD);
    }),
  };
  const audit: IAuditLogger = {
    record: jest.fn(step('audit', undefined)),
    recordInTransaction: jest.fn(),
  };
  const logger = { info: jest.fn(), warn: jest.fn() };
  const config = { publicLinkRequestsPerMinute: REQUESTS_PER_MINUTE };
  const service = new PublicLinkAccessService(
    transactions,
    resolver,
    directory,
    links,
    files,
    rateLimiter,
    hasher,
    audit,
    config,
    logger,
  );
  return {
    service,
    journal,
    rateLimiter,
    resolver,
    directory,
    links,
    files,
    hasher,
    audit,
    logger,
  };
};

const networkKeyOf = (network: string): string =>
  `sharing:link-ip:${createHash('sha256').update(network).digest('hex')}`;

describe('PublicLinkAccessService.openLink (013 CA-9, CA-11, CA-14; ADR-0039)', () => {
  it('CA-9: la ficha con nombre, tamaño, quien comparte, vencimiento y si pide contraseña; nada más', async () => {
    const { service } = setup({ link: availableLink(PASSWORD_HASH) });

    await expect(service.openLink({ token: TOKEN, ip: IP })).resolves.toEqual({
      name: 'Informe.pdf',
      sizeBytes: 2048n,
      sharedBy: { displayName: 'Ana Ruiz' },
      expiresAt: EXPIRES_AT,
      requiresPassword: true,
    });
  });

  it('plan §5, ADR-0039 regla 3: límite → función → propietario activo → actor derivado → enlace y archivo de la fila', async () => {
    const { service, journal, resolver, directory, links, files } = setup();

    await service.openLink({ token: TOKEN, ip: IP });

    expect(journal).toEqual([
      'rate',
      'tx',
      'resolve',
      'activeDisplayName',
      `tx:CLIENT:${RESOLVED.ownerId}`,
      'findAvailable',
      'findOwnedFile',
    ]);
    expect(resolver.resolve).toHaveBeenCalledWith(LinkToken.hashOf(TOKEN));
    expect(directory.activeDisplayName).toHaveBeenCalledWith(RESOLVED.ownerId);
    expect(links.findAvailable).toHaveBeenCalledWith(OWNER, RESOLVED.linkId);
    expect(files.findOwnedFile).toHaveBeenCalledWith(OWNER, RESOLVED.fileId);
  });

  it('CA-14, RN-7: el límite cuenta por red (/64) con su hash, nunca con la IP', async () => {
    const { service, rateLimiter } = setup();

    await service.openLink({ token: TOKEN, ip: IP });

    expect(rateLimiter.consume).toHaveBeenCalledWith(networkKeyOf('2001:db8:aa:bb::/64'), [
      { limit: REQUESTS_PER_MINUTE, windowSeconds: 60 },
    ]);
  });

  it('CA-14: por encima del límite, 429 sin resolver el token ni tocar la base', async () => {
    const { service, journal } = setup({ rate: { allowed: false, retryAfterSeconds: 42 } });

    const error = await service.openLink({ token: TOKEN, ip: IP }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(RateLimitExceededError);
    expect((error as RateLimitExceededError).retryAfterSeconds).toBe(42);
    expect(journal).toEqual(['rate']);
  });

  it('CA-11: un token mal formado es el 404 sin consultar la función', async () => {
    const { service, journal } = setup();

    await expect(service.openLink({ token: 'no-es-un-token', ip: IP })).rejects.toBeInstanceOf(
      PublicLinkUnavailableError,
    );
    expect(journal).toEqual(['rate']);
  });

  it.each([
    ['inexistente, revocado o vencido (la función no da fila)', { resolved: null }, 'resolve'],
    ['propietario suspendido, interno o sin cuenta', { sharedBy: null }, 'activeDisplayName'],
    ['revocado o vencido al releerlo como el propietario', { link: null }, 'findAvailable'],
    ['archivo en la papelera o purgado', { file: null }, 'findOwnedFile'],
  ] as const)('CA-11: %s es el mismo 404', async (_, options, lastStep) => {
    const { service, journal } = setup(options);

    await expect(service.openLink({ token: TOKEN, ip: IP })).rejects.toBeInstanceOf(
      PublicLinkUnavailableError,
    );
    expect(journal.at(-1)).toBe(lastStep);
  });

  it('ADR-0039 regla 3: sin propietario activo no se crea el actor derivado', async () => {
    const { service, journal } = setup({ sharedBy: null });

    await service.openLink({ token: TOKEN, ip: IP }).catch(() => undefined);

    expect(journal.some((entry) => entry.startsWith('tx:'))).toBe(false);
  });

  it('CA-15: la bitácora de no disponible lleva solo ids, nunca token, IP ni nombre', async () => {
    const { service, logger } = setup({ file: null });

    await service.openLink({ token: TOKEN, ip: IP }).catch(() => undefined);

    expect(logger.info).toHaveBeenCalledWith({
      event: 'public_link.unavailable',
      linkId: RESOLVED.linkId,
      fileId: RESOLVED.fileId,
    });
    const logged = JSON.stringify(logger.info.mock.calls);
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain('2001:db8');
    expect(logged).not.toContain('Informe');
  });
});

describe('PublicLinkAccessService.downloadLink (013 CA-10, CA-11, CA-14, CA-18; ADR-0039)', () => {
  const RESOLVE_STEPS = [
    'rate',
    'tx',
    'resolve',
    'activeDisplayName',
    `tx:CLIENT:${RESOLVED.ownerId}`,
    'findAvailable',
    'findOwnedFile',
  ];

  it('CA-10: sin contraseña, el paso compartido y luego la URL de la versión vigente con el actor derivado', async () => {
    const { service, journal, files, hasher } = setup();

    await expect(service.downloadLink({ token: TOKEN, ip: IP })).resolves.toEqual(ISSUED);

    expect(journal).toEqual([...RESOLVE_STEPS, 'issueDownload', 'audit']);
    expect(files.issueDownload).toHaveBeenCalledWith(OWNER, RESOLVED.fileId);
    expect(hasher.verify).not.toHaveBeenCalled();
  });

  it('CA-10: con la contraseña correcta, verifica con el hash del enlace antes de firmar', async () => {
    const { service, journal, hasher } = setup({ link: availableLink(PASSWORD_HASH) });

    await expect(
      service.downloadLink({ token: TOKEN, ip: IP, password: PASSWORD }),
    ).resolves.toEqual(ISSUED);

    expect(journal).toEqual([...RESOLVE_STEPS, 'verify', 'issueDownload', 'audit']);
    expect(hasher.verify).toHaveBeenCalledWith(PASSWORD_HASH, PASSWORD);
  });

  it.each([
    ['incorrecta', { password: 'otra-clave-1234' }],
    ['ausente', {}],
  ] as const)(
    'CA-12 (mínimo de T-07): con contraseña %s, 403 sin URL ni auditoría',
    async (_, extra) => {
      const { service, files, audit } = setup({ link: availableLink(PASSWORD_HASH) });

      await expect(service.downloadLink({ token: TOKEN, ip: IP, ...extra })).rejects.toBeInstanceOf(
        PublicLinkPasswordInvalidError,
      );
      expect(files.issueDownload).not.toHaveBeenCalled();
      expect(audit.record).not.toHaveBeenCalled();
    },
  );

  it('CA-15, CA-18: `public_link.downloaded` con el actor derivado, el propietario afectado y `trigger: public_link`', async () => {
    const { service, audit, logger } = setup();

    await service.downloadLink({ token: TOKEN, ip: IP });

    expect(audit.record).toHaveBeenCalledWith({
      action: 'public_link.downloaded',
      actor: OWNER,
      targetUserId: RESOLVED.ownerId,
      resourceId: RESOLVED.fileId,
      attributes: { trigger: 'public_link' },
    });
    expect(logger.info).toHaveBeenCalledWith({
      event: 'public_link.downloaded',
      linkId: RESOLVED.linkId,
      fileId: RESOLVED.fileId,
    });
    const logged = JSON.stringify([logger.info.mock.calls, jest.mocked(audit.record).mock.calls]);
    for (const secret of [TOKEN, '2001:db8', 'Informe', ISSUED.url]) {
      expect(logged).not.toContain(secret);
    }
  });

  it('ADR-0039 (condición de Adrián): la respuesta es solo la URL y su vencimiento, sin el actor ni ids', async () => {
    const { service } = setup();

    const issued = await service.downloadLink({ token: TOKEN, ip: IP });

    expect(Object.keys(issued).sort()).toEqual(['expiresAt', 'url']);
    expect(JSON.stringify(issued)).not.toContain(RESOLVED.ownerId);
  });

  it('CA-14: comparte el límite por red con `openLink`: por encima, 429 sin resolver ni firmar', async () => {
    const { service, journal } = setup({ rate: { allowed: false, retryAfterSeconds: 42 } });

    await expect(service.downloadLink({ token: TOKEN, ip: IP })).rejects.toBeInstanceOf(
      RateLimitExceededError,
    );
    expect(journal).toEqual(['rate']);
  });

  it.each([
    ['la función no da fila', { resolved: null }],
    ['el propietario no está activo', { sharedBy: null }],
    ['el archivo ya no es propio y vivo', { file: null }],
    ['el archivo dejó de ser vivo antes de firmar', { issued: null }],
  ] as const)('CA-11: %s es el mismo 404, sin auditoría', async (_, options) => {
    const { service, audit } = setup(options);

    await expect(service.downloadLink({ token: TOKEN, ip: IP })).rejects.toBeInstanceOf(
      PublicLinkUnavailableError,
    );
    expect(audit.record).not.toHaveBeenCalled();
  });
});
