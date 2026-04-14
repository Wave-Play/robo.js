/**
 * Flashcore v1 (spec rev 4.3) Adapter Wrappers
 *
 * Export all wrapper classes and factory functions.
 */

// Base class
export { AdapterWrapper } from './base.js'

// In-memory adapter
export { MemoryAdapter, createMemoryAdapter } from './memory.js'

// LRU Cache
export { CacheAdapter, createCacheAdapter } from './cache.js'
export type { CacheOptions, CacheStats } from './cache.js'

// Compression
export { CompressionAdapter, createCompressionAdapter } from './compression.js'
export type { CompressionOptions } from './compression.js'

// Encryption
export { EncryptionAdapter, createEncryptionAdapter } from './encryption.js'
export type { EncryptionOptions } from './encryption.js'

// Resilience
export { ResilienceAdapter, createResilienceAdapter } from './resilience.js'
export type { ResilienceOptions } from './resilience.js'

// Builder
export { AdapterBuilder, buildAdapter, AdapterPresets } from './builder.js'
