export type DeviceKind = 'mobile' | 'tablet' | 'desktop';

export interface UserAgentSummaryValue {
  readonly browser: string;
  readonly os: string;
  readonly deviceKind: DeviceKind;
}

const UNKNOWN_BROWSER = 'Navegador desconocido';
const UNKNOWN_OS = 'Sistema desconocido';

const BROWSERS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'Edge', pattern: /Edg\// },
  { name: 'Samsung Internet', pattern: /SamsungBrowser\// },
  { name: 'Opera', pattern: /OPR\/|Opera\// },
  { name: 'Firefox', pattern: /Firefox\// },
  { name: 'Chrome', pattern: /Chrome\// },
  { name: 'Safari', pattern: /Safari\// },
];

const SYSTEMS: readonly { readonly name: string; readonly pattern: RegExp }[] = [
  { name: 'iOS', pattern: /iPhone/ },
  { name: 'iPadOS', pattern: /iPad/ },
  { name: 'Android', pattern: /Android/ },
  { name: 'Windows', pattern: /Windows/ },
  { name: 'macOS', pattern: /Macintosh|Mac OS X/ },
  { name: 'ChromeOS', pattern: /CrOS/ },
  { name: 'Linux', pattern: /Linux/ },
];

const detect = (ua: string, rows: readonly { readonly name: string; readonly pattern: RegExp }[], fallback: string): string =>
  rows.find((row) => row.pattern.test(ua))?.name ?? fallback;

const deviceKindOf = (ua: string): DeviceKind => {
  if (/iPad|Tablet/i.test(ua)) {
    return 'tablet';
  }
  if (/Mobi|iPhone|Android/.test(ua)) {
    return 'mobile';
  }
  return 'desktop';
};

/** Resumen visible del agente de usuario. Función pura, sin librería (DT-9). */
export class UserAgentSummary {
  readonly browser: string;
  readonly os: string;
  readonly deviceKind: DeviceKind;

  private constructor(value: UserAgentSummaryValue) {
    this.browser = value.browser;
    this.os = value.os;
    this.deviceKind = value.deviceKind;
  }

  static parse(ua: string): UserAgentSummary {
    return new UserAgentSummary({
      browser: detect(ua, BROWSERS, UNKNOWN_BROWSER),
      os: detect(ua, SYSTEMS, UNKNOWN_OS),
      deviceKind: deviceKindOf(ua),
    });
  }
}
