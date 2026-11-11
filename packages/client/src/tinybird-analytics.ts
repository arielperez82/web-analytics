/**
 * Tinybird Analytics Plugin for Analytics.js (TypeScript)
 * Compatible with Tinybird Web Analytics Starter Kit
 */

import { getCountryForTimezone } from 'countries-and-timezones';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import {
  ATTRIBUTION_STORAGE_KEY,
  type AttributionData,
  type AttributionManager,
  createAttributionManager,
  utmFromSearch,
} from './attribution-manager';
import {
  type AnonymousIdentity,
  type ConsentSource,
  type ConsentState,
  dailyIdentity,
  type IdMode,
  resolveIdMode,
} from './identity';
import {
  createSessionManager,
  SESSION_STORAGE_KEY,
  type SessionManager,
} from './session-manager';
import { createStorageManager, type StorageMethod } from './storage-manager';
import {
  createVisitorManager,
  VISITOR_STORAGE_KEY,
} from './visitor-manager';

export interface WebVital {
  name: string;
  value: number;
  delta: number;
  rating: string;
  id: string;
  navigationType?: string;
}

export interface Goal {
  name: string;
  path: string;
}

export interface TinybirdAnalyticsConfig {
  token?: string;
  host?: string;
  proxy?: string;
  proxyUrl?: string;
  domain?: string;
  tenantId?: string;
  datasource?: string;
  storage?: StorageMethod;
  storageFallbacks?: StorageMethod[];
  enableMemoryFallback?: boolean;
  stringifyPayload?: boolean;
  globalAttributes?: Record<string, unknown>;
  webVitals?: boolean;
  devMode?: boolean;
  enableClickTracking?: boolean;
  consent?: ConsentSource;
  anonymousIdentity?: AnonymousIdentity;
  goals?: readonly Goal[];
}

export interface TinybirdIdentityEvent {
  user_id?: string;
  traits?: Record<string, unknown>;
}

export type TinybirdEvent = Record<string, unknown>;

export interface CountryLocale {
  country?: string;
  locale?: string;
}

export interface TinybirdAnalytics {
  config: TinybirdAnalyticsConfig;
  _sessionManager: SessionManager;
  _attributionManager: AttributionManager;
  sendEvent: (eventName: string, event: TinybirdEvent) => void;
  page: (event: TinybirdEvent) => void;
  track: (eventName: string, event: TinybirdEvent) => void;
  identify: (event: TinybirdIdentityEvent) => void;
  _user_id: string;
}

declare global {
  interface Window {
    tinybirdAnalytics: TinybirdAnalytics;
  }
}

/**
 * Get country and locale from timezone and navigator
 */
function getCountryAndLocale(): CountryLocale {
  let country: string | undefined;
  let locale: string | undefined;

  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const countryData = getCountryForTimezone(timezone);
    country = countryData?.id;

    locale =
      navigator.languages && navigator.languages.length
        ? navigator.languages[0]
        : navigator.language || 'en';
  } catch (error) {
    // ignore error
    console.info('Error getting country and locale:', error);
  }

  return { country, locale };
}

/**
 * Get common properties used across all analytics events
 */
function getCommonProperties(
  attributionData: AttributionData | null | undefined
): Record<string, unknown> {
  const { country, locale } = getCountryAndLocale();

  return {
    user_agent: window.navigator.userAgent,
    locale,
    location: country,
    referrer: document.referrer,
    pathname: window.location.pathname,
    href: window.location.href,
    // Attribution data
    ...(attributionData?.utm_source && {
      utm_source: attributionData.utm_source,
    }),
    ...(attributionData?.utm_medium && {
      utm_medium: attributionData.utm_medium,
    }),
    ...(attributionData?.utm_campaign && {
      utm_campaign: attributionData.utm_campaign,
    }),
    ...(attributionData?.utm_term && { utm_term: attributionData.utm_term }),
    ...(attributionData?.utm_content && {
      utm_content: attributionData.utm_content,
    }),
    ...(attributionData?.landing_page && {
      landing_page: attributionData.landing_page,
    }),
    ...(attributionData?.referrer && {
      original_referrer: attributionData.referrer,
    }),
  };
}

/**
 * Try to mask PII and potential sensitive attributes
 */
const _maskSuspiciousAttributes = (payload: TinybirdEvent): string => {
  const attributesToMask = [
    'username',
    'user',
    'password',
    'pass',
    'pin',
    'passcode',
    'token',
    'api_token',
    'email',
    'address',
    'phone',
    'sex',
    'gender',
    'payment',
    'credit_card',
  ];

  // Deep copy
  let _payload = JSON.stringify(payload);
  attributesToMask.forEach(attr => {
    _payload = _payload.replaceAll(
      new RegExp(`("${attr}"):(".+?"|\\d+)`, 'mgi'),
      '$1:"********"'
    );
  });

  return _payload;
};

/**
 * Validation functions
 */
function _isValidUserAgent(userAgent?: string): boolean {
  if (!userAgent || typeof userAgent !== 'string') {
    return true;
  }
  if (userAgent.length > 500) {
    return false;
  }
  return true;
}

function _isValidPayload(payloadStr?: string): boolean {
  if (!payloadStr || typeof payloadStr !== 'string') {
    return false;
  }
  if (payloadStr.length < 2 || payloadStr.length > 10240) {
    return false;
  }
  return true;
}

/**
 * Tinybird Analytics
 */
const tinybirdAnalytics = (
  config: TinybirdAnalyticsConfig = {}
): TinybirdAnalytics => {
  // Validate required configuration
  if (!config.token && !config.proxy && !config.proxyUrl) {
    throw new Error(
      'Tinybird analytics requires either token, proxy, or proxyUrl'
    );
  }

  // Check if both proxy and proxyUrl are specified
  if (config.proxy && config.proxyUrl) {
    throw new Error(
      'Both proxy and proxyUrl are specified. Please use only one of them.'
    );
  }

  if (config.webVitals) {
    const sendMetric = (metric: WebVital): void => {
      try {
        track('web_vital', metric as unknown as TinybirdEvent);
      } catch (error) {
        console.error('Error sending web vital:', error);
      }
    };

    onCLS(sendMetric);
    onFCP(sendMetric);
    onLCP(sendMetric);
    onTTFB(sendMetric);
    onINP(sendMetric);
  }

  const configWithDefaults = {
    // Default configuration
    token: null,
    host: null,
    proxy: null,
    proxyUrl: null,
    domain: null,
    datasource: 'analytics_events',
    storage: 'localStorage',
    storageFallbacks: ['sessionStorage', 'cookie'] as StorageMethod[],
    enableMemoryFallback: true,
    stringifyPayload: true,
    globalAttributes: {},
    webVitals: false,
    ...config,
  } as TinybirdAnalyticsConfig;

  const storageManager = createStorageManager(configWithDefaults);
  const sessionManager = createSessionManager(storageManager);
  const attributionManager = createAttributionManager(storageManager);
  const visitorManager = createVisitorManager(storageManager);

  const consentState = (): ConsentState =>
    configWithDefaults.consent?.getState() ?? 'unknown';
  const idMode = (): IdMode =>
    resolveIdMode({
      consent: consentState(),
      anonymousIdentity: configWithDefaults.anonymousIdentity ?? 'client',
    });

  const clearStoredIdentity = (): void => {
    [SESSION_STORAGE_KEY, VISITOR_STORAGE_KEY, ATTRIBUTION_STORAGE_KEY].forEach(
      key => storageManager.remove(key)
    );
  };

  const browserDailyIdentity = () =>
    dailyIdentity({
      now: new Date(),
      domain: configWithDefaults.domain ?? window.location.hostname,
      userAgent: window.navigator.userAgent,
      screen: {
        width: window.screen.width,
        height: window.screen.height,
        pixelRatio: window.devicePixelRatio,
      },
      language: window.navigator.language,
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });

  const resolveIdentity = (
    mode: IdMode,
    eventName: string
  ): { sessionId?: string; visitorId?: string } => {
    if (mode === 'anonymous') return {};
    if (mode === 'daily_direct') return browserDailyIdentity();
    if (eventName === 'web_vital') {
      return {
        sessionId: sessionManager.peekSessionId() ?? undefined,
        visitorId: visitorManager.getVisitorId(),
      };
    }
    sessionManager.setSessionId(
      sessionManager.getSessionId() || crypto.randomUUID()
    );
    return {
      sessionId: sessionManager.getSessionId() ?? undefined,
      visitorId: visitorManager.getVisitorId(),
    };
  };

  const attributionFor = (mode: IdMode): AttributionData | null =>
    mode === 'persistent'
      ? attributionManager.getAttributionData()
      : utmFromSearch(window.location.search);

  const trimTrailingSlashes = (value: string): string =>
    value.endsWith('/') ? trimTrailingSlashes(value.slice(0, -1)) : value;

  const resolveUrl = (): string => {
    const config = configWithDefaults;
    if (config.proxyUrl) return config.proxyUrl;
    if (config.proxy) return `${config.proxy}/api/tracking`;
    const base = config.host
      ? trimTrailingSlashes(config.host)
      : 'https://api.tinybird.co';
    return `${base}/v0/events?name=${config.datasource}&token=${config.token}`;
  };

  const parseEvent = (json: string): TinybirdEvent => {
    const parsed: unknown = JSON.parse(json);
    return parsed as TinybirdEvent;
  };

  const sendEvent = (eventName: string, event: TinybirdEvent): void => {
    const config = configWithDefaults;

    const mode = idMode();
    if (mode !== 'persistent') clearStoredIdentity();
    const identity = resolveIdentity(mode, eventName);
    const identityAttributes = {
      id_mode: mode,
      ...(identity.visitorId && { visitor_id: identity.visitorId }),
    };

    // Validate user agent
    if (!_isValidUserAgent(window.navigator.userAgent)) {
      return;
    }

    const url = resolveUrl();

    // Process payload
    let processedPayload: TinybirdEvent | string;
    if (config.stringifyPayload) {
      processedPayload = _maskSuspiciousAttributes(event);
      processedPayload = {
        ...parseEvent(processedPayload),
        ...config.globalAttributes,
        storage: config.storage,
        ...identityAttributes,
      };
      processedPayload = JSON.stringify(processedPayload);

      if (!_isValidPayload(processedPayload)) {
        return;
      }
    } else {
      processedPayload = {
        ...event,
        ...config.globalAttributes,
        storage: config.storage,
        ...identityAttributes,
      };
      const maskedStr = _maskSuspiciousAttributes(processedPayload);

      if (!_isValidPayload(maskedStr)) {
        return;
      }

      processedPayload = parseEvent(maskedStr);
    }

    const tinybirdEvent = {
      timestamp: new Date().toISOString(),
      action: eventName,
      version: '1',
      ...(identity.sessionId && { session_id: identity.sessionId }),
      payload: processedPayload,
    };

    if (config.devMode) {
      console.log('Analytics Event Captured:', tinybirdEvent);
    } else {
      // Use Beacon API for better performance and reliability
      const eventData = JSON.stringify(tinybirdEvent);

      // Check if Beacon API is supported
      if (navigator.sendBeacon && navigator.sendBeacon(url, eventData)) {
        // Beacon API successfully sent the data
        return;
      }

      // Fallback to XMLHttpRequest if Beacon API is not supported or fails
      const request = new XMLHttpRequest();
      request.open('POST', url, true);
      request.setRequestHeader('Content-Type', 'application/json');
      request.send(eventData);
    }
  };

  const track = (eventName: string, event: TinybirdEvent): void => {
    const eventData: TinybirdEvent = {
      ...event,
      // Add context data
      ...getCommonProperties(attributionFor(idMode())),
    };

    // Send the event
    sendEvent(eventName, eventData);
  };

  const withoutTrailingSlashes = (path: string): string =>
    path.length > 1 && path.endsWith('/')
      ? withoutTrailingSlashes(path.slice(0, -1))
      : path;

  const goalsReachedAt = (pathname: string): readonly Goal[] =>
    (configWithDefaults.goals ?? []).filter(
      (goal) =>
        withoutTrailingSlashes(goal.path) === withoutTrailingSlashes(pathname)
    );

  const page = (event: TinybirdEvent): void => {
    track('page_hit', event);
    goalsReachedAt(window.location.pathname).forEach((goal) =>
      track(goal.name, {})
    );
  };

  const _identify = (
    instance: TinybirdAnalytics,
    event: TinybirdIdentityEvent
  ): void => {
    if (event.user_id) {
      instance._user_id = event.user_id;
    }

    const identifyData: TinybirdEvent = {
      user_id: instance._user_id,
      ...event.traits,
      ...getCommonProperties(attributionFor(idMode())),
    };

    // Send identify event
    sendEvent('identify', identifyData);
  };

  const tinybirdAnalyticsInstance = {
    config: configWithDefaults,
    _sessionManager: sessionManager,
    _attributionManager: attributionManager,
    sendEvent,
    page,
    track,
    identify: (event: TinybirdIdentityEvent) => {
      _identify(tinybirdAnalyticsInstance, event);
    },
    _user_id: '',
  };

  if (typeof window !== 'undefined') {
    window.tinybirdAnalytics = tinybirdAnalyticsInstance;
  }

  const applyConsent = (): void => {
    if (idMode() === 'persistent') {
      attributionManager.captureAttributionData();
    } else {
      clearStoredIdentity();
    }
  };

  applyConsent();
  configWithDefaults.consent?.subscribe?.(applyConsent);

  return tinybirdAnalyticsInstance;
};

export default tinybirdAnalytics;
