export type AnalyticsEventRow = {
  readonly timestamp: string;
  readonly session_id: string | null;
  readonly action: string;
  readonly version: string;
  readonly payload: string;
  readonly tenant_id: string;
  readonly domain: string;
};

type WebVitalOptions = {
  readonly tenantId: string;
  readonly domain: string;
  readonly name: 'CLS' | 'FCP' | 'INP' | 'LCP' | 'TTFB';
  readonly value: number;
  readonly pathname: string;
  readonly delta?: number;
  readonly sessionId?: string | null;
  readonly userAgent?: string;
  readonly location?: string;
  readonly now?: Date;
};

const ONE_MINUTE_MS = 60_000;

export const uniqueId = (prefix: string): string =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

export const formatTimestamp = (date: Date): string =>
  date.toISOString().slice(0, 19).replace('T', ' ');

export const createWebVitalEvent = ({
  tenantId,
  domain,
  name,
  value,
  pathname,
  delta = 0,
  sessionId = crypto.randomUUID(),
  userAgent,
  location,
  now = new Date(),
}: WebVitalOptions): AnalyticsEventRow => ({
  timestamp: formatTimestamp(new Date(now.getTime() - ONE_MINUTE_MS)),
  session_id: sessionId,
  action: 'web_vital',
  version: 'e2e',
  payload: JSON.stringify({
    name,
    value,
    delta,
    pathname,
    domain,
    ...(userAgent === undefined ? {} : { user_agent: userAgent }),
    ...(location === undefined ? {} : { location }),
  }),
  tenant_id: tenantId,
  domain,
});

type CustomEventOptions = {
  readonly tenantId: string;
  readonly domain: string;
  readonly action: string;
  readonly payload?: Readonly<Record<string, unknown>>;
  readonly sessionId?: string;
  readonly now?: Date;
};

export const createCustomEvent = ({
  tenantId,
  domain,
  action,
  payload = {},
  sessionId = crypto.randomUUID(),
  now = new Date(),
}: CustomEventOptions): AnalyticsEventRow => ({
  timestamp: formatTimestamp(new Date(now.getTime() - ONE_MINUTE_MS)),
  session_id: sessionId,
  action,
  version: 'e2e',
  payload: JSON.stringify(payload),
  tenant_id: tenantId,
  domain,
});

export type Scope = {
  readonly tenantId: string;
  readonly domain: string;
};

export const createScope = (): Scope => ({
  tenantId: uniqueId('tenant'),
  domain: `${uniqueId('site')}.example.com`,
});

export const createSiblingSite = (scope: Scope): Scope => ({
  ...createScope(),
  tenantId: scope.tenantId,
});

export const createRivalTenant = (scope: Scope): Scope => ({
  ...createScope(),
  domain: scope.domain,
});

type PageHitOptions = {
  readonly tenantId: string;
  readonly domain: string;
  readonly pathname: string;
  readonly location?: string;
  readonly locale?: string;
  readonly userAgent?: string;
  readonly referrer?: string;
  readonly sessionId?: string;
  readonly visitorId?: string;
  readonly idMode?: string;
  readonly utm?: Readonly<Record<string, string>>;
  readonly offsetSeconds?: number;
  readonly now?: Date;
};

export const createPageHitEvent = ({
  tenantId,
  domain,
  pathname,
  location,
  locale,
  userAgent,
  referrer,
  sessionId = crypto.randomUUID(),
  visitorId,
  idMode,
  utm = {},
  offsetSeconds = 0,
  now = new Date(),
}: PageHitOptions): AnalyticsEventRow => ({
  timestamp: formatTimestamp(
    new Date(now.getTime() - ONE_MINUTE_MS + offsetSeconds * 1000)
  ),
  session_id: sessionId,
  action: 'page_hit',
  version: 'e2e',
  payload: JSON.stringify({
    pathname,
    domain,
    href: `https://${domain}${pathname}`,
    ...(location === undefined ? {} : { location }),
    ...(locale === undefined ? {} : { locale }),
    ...(userAgent === undefined ? {} : { user_agent: userAgent }),
    ...(referrer === undefined ? {} : { referrer }),
    ...(visitorId === undefined ? {} : { visitor_id: visitorId }),
    ...(idMode === undefined ? {} : { id_mode: idMode }),
    ...utm,
  }),
  tenant_id: tenantId,
  domain,
});
