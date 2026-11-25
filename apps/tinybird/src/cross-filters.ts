import { p } from "@tinybirdco/sdk";

export const crossFilters = `
            {% if defined(location) %}
            AND location = {{ String(location, description="Filter by visitor country code, e.g. US") }}
            {% end %}
            {% if defined(device) %}
            AND device = {{ String(device, description="Filter by device: desktop, mobile-ios, mobile-android or bot") }}
            {% end %}
            {% if defined(browser) %}
            AND browser = {{ String(browser, description="Filter by browser: chrome, firefox, safari, opera, ie or unknown") }}
            {% end %}
            {% if Int32(include_bots, 0) != 1 and String(device, '') != 'bot' %}
            AND device != 'bot'
            {% end %}`;

export const crossFilterParams = {
  location: p.string().optional().describe("Filter by visitor country code, e.g. US"),
  device: p.string().optional().describe("Filter by device: desktop, mobile-ios, mobile-android or bot"),
  browser: p.string().optional().describe("Filter by browser: chrome, firefox, safari, opera, ie or unknown"),
  include_bots: p.int32().optional(0).describe("1 to count bot traffic as well"),
};
