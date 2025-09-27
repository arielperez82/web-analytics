# Tinybird Analytics

A complete analytics solution for Tinybird with Analytics.js integration.
Track user interactions, page views, and web vitals with ease.

## Features

- 🚀 **Easy Integration**: Simple initialization with minimal configuration
- 📊 **Complete Analytics**: Track events, page views, user identification,
  and web vitals
- 🔒 **Privacy First**: Built-in Do Not Track support and PII masking
- 🎯 **Tinybird Optimized**: Designed specifically for Tinybird's analytics
  infrastructure
- 📱 **Cross-Platform**: Works in browsers and modern JavaScript environments
- 🔧 **TypeScript Support**: Full TypeScript definitions included

## Installation

```bash
npm install tinybird-analytics
# or
pnpm add tinybird-analytics
# or
yarn add tinybird-analytics
```

## Quick Start

```typescript
import { initTinybirdAnalytics } from "tinybird-analytics";

// Initialize analytics
const analytics = initTinybirdAnalytics({
  token: "your-tinybird-token",
  host: "https://api.tinybird.co",
  domain: "example.com",
  tenantId: "your-tenant-id",
});

// Track events
analytics.track("button_clicked", {
  button: "signup",
  page: "home",
});

// Track page views
analytics.page({
  title: "Home Page",
  url: "/home",
});

// Identify users
analytics.identify("user123", {
  name: "John Doe",
  email: "john@example.com",
});
```

## Configuration

### Required Parameters

- `token`: Your Tinybird API token
- `host`: Your Tinybird host URL (e.g., `https://api.tinybird.co`)
- `domain`: Your website domain
- `tenantId`: Your tenant identifier

### Optional Parameters

- `datasource`: Tinybird datasource name (default: `analytics_events`)
- `storage`: Storage method for session data (default: `localStorage`)
- `webVitals`: Enable web vitals tracking (default: `true`)
- `enableClickTracking`: Enable automatic click tracking for links with
  `data-track` attribute (default: `false`)
- `globalAttributes`: Global attributes to include with all events
- - `tenantId`: Your tenant identifier (default: domain)

### Example Configuration

```typescript
const analytics = initTinybirdAnalytics({
  token: "p.eyJ1IjoiZXhhbXBsZSIsImV4cCI6MTY5ODc2MDAwMH0.example",
  host: "https://api.tinybird.co",
  domain: "example.com",
  tenantId: "my-company",
  datasource: "custom_events",
  storage: "sessionStorage",
  webVitals: true,
  enableClickTracking: true,
  globalAttributes: {
    site: "my-website",
    version: "1.0.0",
  },
});
```

## API Reference

### `initTinybirdAnalytics(config)`

Initialize the analytics instance with the provided configuration.

**Parameters:**

- `config`: Configuration object (see Configuration section above)

**Returns:** Analytics instance with tracking methods

### Analytics Instance Methods

#### `track(eventName, properties)`

Track a custom event.

```typescript
analytics.track("purchase", {
  product: "Widget",
  price: 29.99,
  currency: "USD",
});
```

#### `page(properties)`

Track a page view.

```typescript
analytics.page({
  title: "Product Page",
  url: "/products/widget",
  category: "Electronics",
});
```

#### `identify(userId, traits)`

Identify a user.

```typescript
analytics.identify("user123", {
  name: "John Doe",
  email: "john@example.com",
  plan: "premium",
});
```

## Advanced Usage

### Custom Storage

```typescript
const analytics = initTinybirdAnalytics({
  // ... other config
  storage: "cookie", // or 'sessionStorage', 'localStorage'
});
```

### Disable Web Vitals

```typescript
const analytics = initTinybirdAnalytics({
  // ... other config
  webVitals: false,
});
```

### Enable Click Tracking

```typescript
const analytics = initTinybirdAnalytics({
  // ... other config
  enableClickTracking: true,
});
```

### Global Attributes

Add attributes that will be included with every event:

```typescript
const analytics = initTinybirdAnalytics({
  // ... other config
  globalAttributes: {
    environment: "production",
    version: "2.1.0",
    team: "frontend",
  },
});
```

## Web Vitals

The library automatically tracks Core Web Vitals when enabled:

- **CLS** (Cumulative Layout Shift)
- **FCP** (First Contentful Paint)
- **LCP** (Largest Contentful Paint)
- **TTFB** (Time to First Byte)
- **INP** (Interaction to Next Paint)

## Click Tracking

When `enableClickTracking` is set to `true`, the library automatically tracks
clicks on links that have a `data-track` attribute. This feature provides
automatic link click tracking without requiring manual event tracking.

### Usage

```typescript
const analytics = initTinybirdAnalytics({
  // ... other config
  enableClickTracking: true,
});
```

### HTML Setup

Add the `data-track` attribute to any link you want to track:

```html
<a href="/products" data-track>View Products</a>
<a href="https://example.com" data-track data-track-link-type="external"
  >External Link</a
>
```

### Event Properties

When a link is clicked, a `link_click` event is automatically tracked with the
following properties:

- `element_id`: The ID of the clicked element (if present)
- `link_type`: Automatically inferred type (`web`, `social`, `media`, `email`)
- `link_url`: The destination URL
- `link_text`: The link text content
- Custom properties from `data-track-prop*` attributes

### Custom Link Types

You can specify a custom link type using the `data-track-link-type` attribute:

```html
<a href="/download" data-track data-track-link-type="download">Download PDF</a>
```

### Custom Properties

Add custom properties using `data-track-prop*` attributes:

```html
<a
  href="/signup"
  data-track
  data-track-prop-category="cta"
  data-track-prop-position="header"
>
  Sign Up
</a>
```

## Privacy & Compliance

- **Do Not Track**: Automatically respects user's Do Not Track preferences
- **PII Masking**: Automatically masks potentially sensitive data

## TypeScript Support

Full TypeScript definitions are included:

```typescript
import type { TinybirdAnalyticsConfig } from "tinybird-analytics";

const config: TinybirdAnalyticsConfig = {
  token: "your-token",
  host: "https://api.tinybird.co",
  domain: "example.com",
  tenantId: "your-tenant",
};
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT © Your Name

## Support

- 📖 [Documentation](https://github.com/arielperez82/web-analytics/client#readme)
- 🐛 [Issues](https://github.com/arielperez82/web-analytics/issues)
- 💬 [Discussions](https://github.com/arielperez82/web-analytics/discussions)
