import { UserAgentSummary } from './user-agent-summary.vo';

const SAMPLES: readonly {
  readonly ua: string;
  readonly browser: string;
  readonly os: string;
  readonly deviceKind: 'mobile' | 'tablet' | 'desktop';
}[] = [
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0',
    browser: 'Edge',
    os: 'Windows',
    deviceKind: 'desktop',
  },
  {
    ua: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    browser: 'Chrome',
    os: 'macOS',
    deviceKind: 'desktop',
  },
  {
    ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    browser: 'Safari',
    os: 'iOS',
    deviceKind: 'mobile',
  },
  {
    ua: 'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
    browser: 'Safari',
    os: 'iPadOS',
    deviceKind: 'tablet',
  },
  {
    ua: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
    browser: 'Chrome',
    os: 'Android',
    deviceKind: 'mobile',
  },
  {
    ua: 'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/23.0 Chrome/115.0.0.0 Mobile Safari/537.36',
    browser: 'Samsung Internet',
    os: 'Android',
    deviceKind: 'mobile',
  },
  {
    ua: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 OPR/106.0.0.0',
    browser: 'Opera',
    os: 'Windows',
    deviceKind: 'desktop',
  },
  {
    ua: 'Mozilla/5.0 (X11; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
    browser: 'Firefox',
    os: 'Linux',
    deviceKind: 'desktop',
  },
  {
    ua: 'Mozilla/5.0 (X11; CrOS x86_64 14541.0.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    browser: 'Chrome',
    os: 'ChromeOS',
    deviceKind: 'desktop',
  },
];

describe('UserAgentSummary.parse', () => {
  it.each(SAMPLES)('resume $browser en $os ($deviceKind)', ({ ua, browser, os, deviceKind }) => {
    expect(UserAgentSummary.parse(ua)).toEqual({ browser, os, deviceKind });
  });

  it.each(['', 'curl/8.0'])('trata %j como navegador y sistema desconocidos de escritorio', (ua) => {
    expect(UserAgentSummary.parse(ua)).toEqual({
      browser: 'Navegador desconocido',
      os: 'Sistema desconocido',
      deviceKind: 'desktop',
    });
  });
});
