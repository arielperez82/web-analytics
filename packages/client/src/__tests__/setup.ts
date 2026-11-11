/**
 * Vitest setup file for environment testing
 */
import { afterAll, afterEach, beforeAll } from 'vitest';

import { server } from './server';

// Setup MSW server
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
