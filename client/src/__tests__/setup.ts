/**
 * Vitest setup file for environment testing
 */

import { TextDecoder, TextEncoder } from 'util';
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './server';

// Setup TextEncoder/TextDecoder for jsdom environment
global.TextEncoder = TextEncoder as unknown as typeof globalThis.TextEncoder;
global.TextDecoder = TextDecoder as unknown as typeof globalThis.TextDecoder;

// Setup MSW server
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
