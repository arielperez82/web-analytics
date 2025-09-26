/**
 * Tinybird Analytics Plugin for Analytics.js (TypeScript)
 * Compatible with Tinybird Web Analytics Starter Kit
 */

import { getCountryForTimezone } from 'countries-and-timezones';
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

import {
  type AttributionManager,
  createAttributionManager,
} from './attribution-manager';
import { createSessionManager, type SessionManager } from './session-manager';
import { createStorageManager, type StorageMethod } from './storage-manager';

export interface WebVital {
  name: string;
  value: number;
  delta: number;
  rating: string;
  id: string;
  navigationType?: string;
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
  attributionManager?: AttributionManager
): Record<string, unknown> {
  const { country, locale } = getCountryAndLocale();
  const attributionData = attributionManager?.getAttributionData();

  return {
    'user-agent': window.navigator.userAgent,
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
    storage: 'localStorage' as StorageMethod,
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

  const sendEvent = (eventName: string, event: TinybirdEvent): void => {
    const config = configWithDefaults;

    // Set session ID
    sessionManager.setSessionId(
      sessionManager.getSessionId() || crypto.randomUUID()
    );

    // Validate user agent
    if (!_isValidUserAgent(window.navigator.userAgent)) {
      return;
    }

    // Determine URL
    let url: string;
    if (config.proxyUrl) {
      url = config.proxyUrl;
    } else if (config.proxy) {
      url = `${config.proxy}/api/tracking`;
    } else if (config.host) {
      const cleanHost = config.host.replace(/\/+$/gm, '');
      url = `${cleanHost}/v0/events?name=${config.datasource}&token=${config.token}`;
    } else {
      url = `https://api.tinybird.co/v0/events?name=${config.datasource}&token=${config.token}`;
    }

    // Process payload
    let processedPayload: TinybirdEvent | string;
    if (config.stringifyPayload) {
      processedPayload = _maskSuspiciousAttributes(event);
      processedPayload = Object.assign(
        {},
        JSON.parse(processedPayload),
        config.globalAttributes,
        { storage: config.storage }
      );
      processedPayload = JSON.stringify(processedPayload);

      if (!_isValidPayload(processedPayload)) {
        return;
      }
    } else {
      processedPayload = Object.assign({}, event, config.globalAttributes, {
        storage: config.storage,
      });
      const maskedStr = _maskSuspiciousAttributes(processedPayload);

      if (!_isValidPayload(maskedStr)) {
        return;
      }

      processedPayload = JSON.parse(maskedStr);
    }

    const sessionId = sessionManager.getSessionId() || crypto.randomUUID();

    const tinybirdEvent = {
      timestamp: new Date().toISOString(),
      action: eventName,
      version: '1',
      session_id: sessionId,
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
      ...getCommonProperties(attributionManager),
    };

    // Send the event
    sendEvent(eventName, eventData);
  };

  const page = (event: TinybirdEvent): void => {
    // Send the event
    track('page_hit', event);
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
      ...getCommonProperties(attributionManager),
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

  attributionManager?.captureAttributionData();

  return tinybirdAnalyticsInstance;
};

export default tinybirdAnalytics;
