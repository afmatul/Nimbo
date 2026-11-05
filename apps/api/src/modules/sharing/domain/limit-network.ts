import { createHash } from 'node:crypto';
import { isIPv6 } from 'node:net';

const IPV4_PREFIX = 32;
const IPV6_PREFIX = 64;
const IPV6_GROUPS = 8;
const BITS_PER_GROUP = 16;
const BITS_PER_OCTET = 8;
const OCTET_MASK = 0xff;
const HEX_RADIX = 16;
const OCTET_BASE = 2 ** BITS_PER_OCTET;
const GROUP_BASE = 2 ** BITS_PER_GROUP;
const NETWORK_GROUPS = IPV6_PREFIX / BITS_PER_GROUP;
/** `::ffff:a.b.c.d`: cinco grupos en cero y `ffff` antes de los dos grupos de la IPv4 (RFC 4291 §2.5.5.2). */
const MAPPED_ZERO_GROUPS = 5;
const MAPPED_MARKER = 0xffff;
/** Zona de una IPv6 de enlace local (`fe80::1%eth0`): no cambia la red. */
const ZONE_SUFFIX = /%.*$/;

/** Grupos de una IPv6 con la IPv4 final (`::ffff:1.2.3.4`, `64:ff9b::1.2.3.4`) ya pasada a dos grupos. */
const withHexTail = (address: string): string => {
  const cut = address.lastIndexOf(':') + 1;
  const tail = address.slice(cut);
  if (!tail.includes('.')) return address;
  const value = tail.split('.').reduce((acc, octet) => acc * OCTET_BASE + Number(octet), 0);
  const high = Math.floor(value / GROUP_BASE).toString(HEX_RADIX);
  const low = (value % GROUP_BASE).toString(HEX_RADIX);
  return `${address.slice(0, cut)}${high}:${low}`;
};

/** Los ocho grupos de 16 bits de una IPv6 válida, con `::` expandido. */
const ipv6Groups = (address: string): number[] => {
  const [head, tail] = withHexTail(address).split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros: string[] = Array.from(
    { length: IPV6_GROUPS - left.length - right.length },
    () => '0',
  );
  return [...left, ...zeros, ...right].map((group) => parseInt(group, HEX_RADIX));
};

const isIPv4Mapped = (groups: readonly number[]): boolean =>
  groups.slice(0, MAPPED_ZERO_GROUPS).every((group) => group === 0) &&
  groups[MAPPED_ZERO_GROUPS] === MAPPED_MARKER;

const octetsOf = (group: number): number[] => [group >> BITS_PER_OCTET, group & OCTET_MASK];

const ipv4Network = (ipv4: string): string => `${ipv4}/${IPV4_PREFIX}`;

/**
 * Red que cuentan los límites del visitante (013 RN-7, plan §5): la IPv4 sola (/32) y la IPv6 por su /64, así rotar
 * direcciones dentro de un /64 no evade el bloqueo. Una IPv4 mapeada en IPv6 cuenta como la IPv4. `req.ip` solo da IPv4
 * o IPv6; cualquier otro valor cuenta como una red propia.
 */
export const limitNetworkOf = (ip: string): string => {
  const address = ip.replace(ZONE_SUFFIX, '');
  if (!isIPv6(address)) return ipv4Network(address);
  const groups = ipv6Groups(address.toLowerCase());
  if (isIPv4Mapped(groups)) return ipv4Network(groups.slice(-2).flatMap(octetsOf).join('.'));
  const prefix = groups.slice(0, NETWORK_GROUPS).map((group) => group.toString(HEX_RADIX));
  return `${prefix.join(':')}::/${IPV6_PREFIX}`;
};

/**
 * La red de los límites del visitante (RN-7) con hash: la usan la clave del límite por red y la del bloqueo por
 * contraseñas fallidas, así en Redis nunca va la IP ni la red en claro (plan §5, S-3).
 */
export const networkHashOf = (ip: string): string =>
  createHash('sha256').update(limitNetworkOf(ip)).digest('hex');
