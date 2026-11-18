import {
  createCustomEvent,
  createPageHitEvent,
  createWebVitalEvent,
} from '../testing/tinybird/helpers/factories';
import { buildSdkLocal } from '../testing/tinybird/helpers/tb-cli';
import { ingestEvents } from '../testing/tinybird/helpers/tinybird-client';
import { resolveTinybirdEnv } from '../testing/tinybird/helpers/tinybird-env';

const TENANT = 'demo';
const DOMAIN = 'demo.example.com';
const DAYS = 14;
const LOCAL_URL = 'http://localhost:7181';
const DAY_MS = 86_400_000;
const BATCH = 400;

const mulberry32 = (initial: number) => {
  let seed = initial;
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};
const random = mulberry32(2026);
const pick = <T>(items: readonly T[]): T =>
  items[Math.floor(random() * items.length)] as T;
const between = (low: number, high: number): number =>
  low + Math.floor(random() * (high - low + 1));

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const FIREFOX =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:132.0) Gecko/20100101 Firefox/132.0';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const CHROME_ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const GOOGLEBOT =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';
const AGENTS = [
  CHROME,
  CHROME,
  FIREFOX,
  SAFARI_IOS,
  SAFARI_IOS,
  CHROME_ANDROID,
];
const LOCATIONS = ['ES', 'ES', 'ES', 'FR', 'DE', 'US', 'US', 'GB', 'MX', 'IT'];
const PAGES = [
  '/',
  '/',
  '/pricing',
  '/blog',
  '/blog/launch',
  '/docs',
  '/docs/install',
  '/about',
];
const GOOGLE = 'https://www.google.com/';
const SOURCES: { referrer: string; utm: Record<string, string> }[] = [
  { referrer: '', utm: {} },
  { referrer: '', utm: {} },
  { referrer: GOOGLE, utm: {} },
  { referrer: GOOGLE, utm: {} },
  { referrer: 'https://news.ycombinator.com/', utm: {} },
  { referrer: 'https://twitter.com/', utm: {} },
  {
    referrer: '',
    utm: {
      utm_source: 'newsletter',
      utm_medium: 'email',
      utm_campaign: 'launch',
    },
  },
  {
    referrer: GOOGLE,
    utm: { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'brand' },
  },
];
const VITALS = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'] as const;
const vitalValue = (name: string): number => {
  if (name === 'CLS') return random() / 5;
  return name === 'LCP' ? between(900, 4200) : between(40, 900);
};
const visitorIds = Array.from(
  { length: 140 },
  (_, index) => `visitor-${index}`
);
const MODES = ['persistent', 'persistent', 'daily_direct', 'daily_proxy'];
const modeOf = (id: string): string =>
  MODES[Number(id.split('-')[1]) % MODES.length] as string;

const visit = (dayStart: number, kind: 'bot' | 'human') => {
  const sessionId = crypto.randomUUID();
  const visitorId = pick(visitorIds);
  const source = pick(SOURCES);
  const startedAt = new Date(dayStart + between(0, DAY_MS - 600_000));
  const userAgent = kind === 'bot' ? GOOGLEBOT : pick(AGENTS);
  const pathnames = Array.from(
    { length: kind === 'bot' ? between(1, 6) : between(1, 4) },
    () => pick(PAGES)
  );
  const converts = kind === 'human' && random() < 0.07;
  const hits = (converts ? [...pathnames, '/thanks'] : pathnames).map(
    (pathname, index) =>
      createPageHitEvent({
        tenantId: TENANT,
        domain: DOMAIN,
        pathname,
        location: kind === 'bot' ? 'US' : pick(LOCATIONS),
        locale: 'en-US',
        userAgent,
        referrer: index === 0 ? source.referrer : '',
        sessionId,
        visitorId,
        idMode: modeOf(visitorId),
        utm: index === 0 ? source.utm : {},
        offsetSeconds: index * between(15, 90),
        now: new Date(startedAt.getTime() + 60_000),
      })
  );
  const vitals =
    kind === 'human' && random() < 0.4
      ? VITALS.map(name =>
          createWebVitalEvent({
            tenantId: TENANT,
            domain: DOMAIN,
            name,
            value: vitalValue(name),
            pathname: pick(PAGES),
            sessionId,
            now: startedAt,
          })
        )
      : [];
  const custom = converts
    ? [
        createCustomEvent({
          tenantId: TENANT,
          domain: DOMAIN,
          action: 'signup',
          sessionId,
          now: startedAt,
        }),
      ]
    : [];
  return [...hits, ...vitals, ...custom];
};

const rows = Array.from({ length: DAYS }, (_, back) => {
  const dayStart = Math.floor((Date.now() - back * DAY_MS) / DAY_MS) * DAY_MS;
  return [
    ...Array.from({ length: between(40, 110) }, () => visit(dayStart, 'human')),
    ...Array.from({ length: between(8, 25) }, () => visit(dayStart, 'bot')),
  ].flat();
}).flat();

const fetchLocalJson = async (
  path: string,
  bearer?: string
): Promise<unknown> => {
  const response = await fetch(`${LOCAL_URL}${path}`, {
    headers: bearer ? { Authorization: `Bearer ${bearer}` } : {},
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  return response.json();
};

const env = await resolveTinybirdEnv({
  buildLocal: buildSdkLocal,
  fetchLocal: fetchLocalJson,
});
for (let index = 0; index < rows.length; index += BATCH)
  await ingestEvents(env, rows.slice(index, index + BATCH));
console.log(
  JSON.stringify({
    tenant: TENANT,
    domain: DOMAIN,
    events: rows.length,
    host: env.host,
    token: env.token,
  })
);
