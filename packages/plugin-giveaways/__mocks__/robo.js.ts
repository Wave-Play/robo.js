/**
 * Manual mock for robo.js module used by plugin-giveaways tests.
 *
 * This file is resolved via jest.config.ts moduleNameMapper ("^robo\\.js$")
 * and must provide the same surface as the real package that the plugin
 * depends on: a Flashcore API, a Discord `client`, and a `logger` with
 * `.fork()` plus standard level methods.
 *
 * Importantly, Flashcore here DELEGATES to the shared jest.fn-backed mocks so
 * tests can both seed data and assert call arguments consistently.
 */

import { jest } from '@jest/globals'
import { mockFlashcore, mockClient } from '../__tests__/helpers/mocks.js'

// Bridge Flashcore to the shared test mock (which uses jest.fn for call asserts)
export const Flashcore = {
  get: (key: string, options?: { namespace?: string[]; default?: unknown }) =>
    mockFlashcore.get(key, options as any),
  set: (key: string, value: unknown, options?: { namespace?: string[] }) =>
    mockFlashcore.set(key, value, options as any),
  delete: (key: string, options?: { namespace?: string[] }) =>
    mockFlashcore.delete(key, options as any)
}

// Minimal logger stub that supports logger.fork('...').debug/info/warn/error
const baseLogger = {
  debug: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}

export const logger = {
  ...baseLogger,
  fork: jest.fn(() => ({ ...baseLogger }))
}

// Re-export the shared mock client used by tests
export { mockClient as client }

export default { Flashcore, client: mockClient, logger }
