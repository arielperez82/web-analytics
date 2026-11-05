export type AnalyticsEventRow = {
  readonly timestamp: string;
  readonly session_id: string;
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
  now = new Date(),
}: WebVitalOptions): AnalyticsEventRow => ({
  timestamp: formatTimestamp(new Date(now.getTime() - ONE_MINUTE_MS)),
  session_id: crypto.randomUUID(),
  action: 'web_vital',
  version: 'e2e',
  payload: JSON.stringify({ name, value, delta, pathname, domain }),
  tenant_id: tenantId,
  domain,
});
