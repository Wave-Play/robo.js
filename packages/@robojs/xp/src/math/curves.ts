/**
 * Level curve builders and resolution system
 *
 * This module implements the runtime level curve system for @robojs/xp, converting
 * serializable curve configurations (LevelCurveConfig) into executable curve functions
 * (LevelCurve) used by the XP calculation system.
 *
 * ## Architecture Overview
 *
 * **Three-Tier Precedence:**
 * 1. **Plugin getCurve callback** (highest priority) - Code-based, dynamic per guild/store
 *    - Defined in plugin options: `levels.getCurve(guildId, storeId)`
 *    - Can return custom LevelCurve objects for advanced customization
 *    - Allows per-guild, per-store dynamic curve generation
 *
 * 2. **Guild preset** (medium priority) - Stored in Flashcore, per guild/store
 *    - Defined in guild config: `config.levels` (type: LevelCurveConfig)
 *    - Serializable preset configs (quadratic, linear, exponential, lookup)
 *    - Built using curve builder functions
 *
 * 3. **Default quadratic** (lowest priority) - Fallback using standard formula
 *    - Uses constants from curve.ts: DEFAULT_CURVE_A=5, DEFAULT_CURVE_B=50, DEFAULT_CURVE_C=100
 *    - Formula: XP = 5*level² + 50*level + 100
 *    - Always available as final fallback
 *
 * **Caching:**
 * - Resolved curves are cached per `(guildId, storeId)` composite key
 * - Cache is in-memory Map (cleared on restart, same as config cache)
 * - Avoids rebuilding curves on every XP operation
 * - Cache invalidation: Call invalidateCurveCache(guildId, storeId) after config changes
 * - Integration: Config update functions should invalidate curve cache (subsequent phase)
 *
 * **Usage:**
 * - Primary API: `getResolvedCurve(guildId, storeId)` - returns cached or resolved curve
 * - Used by: `src/core/xp.ts` for XP manipulation (subsequent phase)
 * - Builders exposed for testing: `buildQuadraticCurve`, `buildLinearCurve`, etc.
 *
 * ## Curve Types
 *
 * - **Quadratic** (default): XP = a*level² + b*level + c (smooth acceleration)
 * - **Linear**: XP = level * xpPerLevel (constant progression)
 * - **Exponential**: XP = multiplier * base^level (rapid growth)
 * - **Lookup**: Direct array mapping of levels to XP thresholds
 *
 * @see {@link LevelCurve} for runtime interface
 * @see {@link LevelCurveConfig} for serializable preset configs
 * @see {@link getResolvedCurve} for primary entry point
 */

import type {
	LevelCurve,
	LevelCurveConfig,
	QuadraticCurve,
	LinearCurve,
	ExponentialCurve,
	LookupCurve,
	PluginOptions,
	GuildConfig
} from '../types.js'
import { getPluginOptions } from 'robo.js'
import { getConfig } from '../store/index.js'
import { DEFAULT_CURVE_A, DEFAULT_CURVE_B, DEFAULT_CURVE_C } from './curve.js'
import { xpLogger } from '../core/logger.js'

// ============================================================================
// Cache Management
// ============================================================================

/**
 * In-memory cache for resolved level curves
 *
 * Key: composite 'guildId:storeId', Value: LevelCurve
 * Example keys: '123456789:default', '123456789:reputation'
 *
 * Stores resolved curves to avoid rebuilding on every XP operation.
 * Cache is cleared on restart (same behavior as config cache).
 */
const curveCache = new Map<string, LevelCurve>()

/**
 * Separator used in composite cache keys
 * Must not appear in storeId to avoid ambiguous keys
 */
const CACHE_KEY_SEPARATOR = ':'

/**
 * Generates cache key for guild and store combination
 *
 * @param guildId - Guild ID
 * @param storeId - Store ID (must not contain ':')
 * @returns Composite key in format 'guildId:storeId'
 * @throws Error if storeId contains ':' (validation to prevent ambiguous keys)
 *
 * @example
 * getCurveKey('123456789', 'default') // '123456789:default'
 * getCurveKey('987654321', 'reputation') // '987654321:reputation'
 */
function getCurveKey(guildId: string, storeId: string): string {
	// Validate constraint to prevent ambiguous keys
	if (storeId.includes(CACHE_KEY_SEPARATOR)) {
		throw new Error(`storeId must not contain '${CACHE_KEY_SEPARATOR}' (used as cache key separator)`)
	}
	return `${guildId}${CACHE_KEY_SEPARATOR}${storeId}`
}

// ============================================================================
// Curve Builders
// ============================================================================

/**
 * Builds a quadratic level curve from configuration
 *
 * Uses the formula: XP = a*level² + b*level + c
 *
 * This is the default curve type, providing smooth, accelerating growth that
 * rewards consistent engagement.
 *
 * @param config - Quadratic curve configuration
 * @returns Runtime LevelCurve with xpForLevel and levelFromXp functions
 * @throws Error if coefficients a, b, c are not positive numbers
 *
 * @remarks
 * Default values (a=5, b=50, c=100) produce the standard quadratic curve:
 * - Level 1: 155 XP
 * - Level 5: 475 XP
 * - Level 10: 1100 XP
 * - Level 20: 3100 XP
 *
 * The xpForLevel function returns the total XP threshold for a level (not per-level cost).
 * Level 0 returns 0, and for level > 0 it returns a*level² + b*level + c.
 *
 * The levelFromXp function uses the closed-form inverse quadratic formula:
 * level = floor((-b + sqrt(b² - 4*a*(c - totalXp))) / (2*a))
 * This provides O(1) calculation instead of iterative search.
 *
 * maxLevel capping: If specified, xpForLevel returns Infinity for levels exceeding the cap,
 * and levelFromXp never returns levels higher than maxLevel.
 *
 * @example Default MEE6 curve (params can be omitted)
 * const curve = buildQuadraticCurve({ type: 'quadratic' })
 * curve.xpForLevel(1) // 155
 * curve.levelFromXp(155) // 1
 *
 * @example Custom steeper curve with level cap
 * const curve = buildQuadraticCurve({
 *   type: 'quadratic',
 *   params: { a: 10, b: 100, c: 200 },
 *   maxLevel: 50
 * })
 * curve.xpForLevel(51) // Infinity (exceeds maxLevel)
 */
export function buildQuadraticCurve(config: QuadraticCurve): LevelCurve {
	// Extract parameters with defaults
	const a = config.params?.a ?? DEFAULT_CURVE_A
	const b = config.params?.b ?? DEFAULT_CURVE_B
	const c = config.params?.c ?? DEFAULT_CURVE_C

	// Validate parameters
	if (a <= 0 || b <= 0 || c <= 0) {
		throw new Error('QuadraticCurve: coefficients a, b, c must be positive numbers')
	}

	// Build xpForLevel function - returns total XP threshold for level
	const xpForLevel = (level: number): number => {
		// Handle maxLevel capping
		if (config.maxLevel !== undefined && level > config.maxLevel) {
			return Infinity
		}

		// Handle level 0 edge case
		if (level <= 0) {
			return 0
		}

		// Apply quadratic formula: a*level² + b*level + c
		return a * level * level + b * level + c
	}

	// Build levelFromXp function using closed-form inverse quadratic formula
	const levelFromXp = (totalXp: number): number => {
		// Handle negative/zero XP
		if (totalXp <= 0) {
			return 0
		}

		// Inverse quadratic formula: level = floor((-b + sqrt(b² - 4*a*(c - totalXp))) / (2*a))
		const discriminant = b * b - 4 * a * (c - totalXp)

		// If discriminant is negative, totalXp is below level 1 threshold
		if (discriminant < 0) {
			return 0
		}

		// Calculate level using quadratic formula
		let level = Math.floor((-b + Math.sqrt(discriminant)) / (2 * a))

		// Ensure non-negative
		if (level < 0) {
			level = 0
		}

		// Cap at maxLevel if specified
		if (config.maxLevel !== undefined && level > config.maxLevel) {
			level = config.maxLevel
		}

		return level
	}

	return {
		xpForLevel,
		levelFromXp,
		maxLevel: config.maxLevel
	}
}

/**
 * Builds a linear level curve from configuration
 *
 * Uses the formula: XP = level * xpPerLevel
 *
 * Provides constant, predictable progression where each level requires
 * the same amount of XP. Ideal for simple systems or time-based progression.
 *
 * @param config - Linear curve configuration
 * @returns Runtime LevelCurve with xpForLevel and levelFromXp functions
 * @throws Error if xpPerLevel is missing or not a positive number
 *
 * @remarks
 * The xpPerLevel parameter is required and must be positive. There is no
 * sensible default for linear curves.
 *
 * Example progression with xpPerLevel=100:
 * - Level 1: 100 XP
 * - Level 5: 500 XP
 * - Level 10: 1000 XP
 * - Level 20: 2000 XP
 *
 * Linear curves are the simplest and most predictable. The inverse calculation
 * is straightforward: level = floor(totalXp / xpPerLevel)
 *
 * @example Simple 100 XP per level
 * const curve = buildLinearCurve({
 *   type: 'linear',
 *   params: { xpPerLevel: 100 }
 * })
 * curve.xpForLevel(10) // 1000
 * curve.levelFromXp(1000) // 10
 *
 * @example With level cap
 * const curve = buildLinearCurve({
 *   type: 'linear',
 *   params: { xpPerLevel: 250 },
 *   maxLevel: 100
 * })
 * curve.levelFromXp(30000) // 100 (capped at maxLevel)
 */
export function buildLinearCurve(config: LinearCurve): LevelCurve {
	// Extract required parameter
	const xpPerLevel = config.params.xpPerLevel

	// Validate parameter
	if (typeof xpPerLevel !== 'number' || xpPerLevel <= 0) {
		throw new Error('LinearCurve: xpPerLevel must be positive number')
	}

	// Build xpForLevel function
	const xpForLevel = (level: number): number => {
		// Handle maxLevel capping
		if (config.maxLevel !== undefined && level > config.maxLevel) {
			return Infinity
		}

		// Handle negative levels
		if (level <= 0) {
			return 0
		}

		// Apply linear formula: level * xpPerLevel
		return level * xpPerLevel
	}

	// Build levelFromXp function (simple division)
	const levelFromXp = (totalXp: number): number => {
		// Handle negative/zero XP
		if (totalXp <= 0) {
			return 0
		}

		// Calculate level directly: floor(totalXp / xpPerLevel)
		let level = Math.floor(totalXp / xpPerLevel)

		// Cap at maxLevel if specified
		if (config.maxLevel !== undefined && level > config.maxLevel) {
			level = config.maxLevel
		}

		return level
	}

	return {
		xpForLevel,
		levelFromXp,
		maxLevel: config.maxLevel
	}
}

/**
 * Builds an exponential level curve from configuration
 *
 * Uses the formula: XP = multiplier * base^level
 *
 * Provides rapid, accelerating growth ideal for prestige systems or
 * long-term engagement. Requires careful tuning to avoid overflow.
 *
 * @param config - Exponential curve configuration
 * @returns Runtime LevelCurve with xpForLevel and levelFromXp functions
 * @throws Error if base or multiplier are missing or not positive numbers
 *
 * @remarks
 * Both base and multiplier are required parameters with no sensible defaults.
 * Both must be positive numbers.
 *
 * IMPORTANT: Exponential curves grow very rapidly. Always set a maxLevel to
 * prevent integer overflow and performance issues. Test thoroughly with
 * realistic player engagement patterns.
 *
 * Example progression with base=2, multiplier=100:
 * - Level 1: 200 XP (100 * 2^1)
 * - Level 5: 3,200 XP (100 * 2^5)
 * - Level 10: 102,400 XP (100 * 2^10)
 * - Level 20: 104,857,600 XP (100 * 2^20)
 *
 * Level 0 is a special case: returns 0 XP instead of multiplier * base^0 = multiplier.
 * This prevents users from starting at non-zero XP.
 *
 * The levelFromXp function uses logarithms for inverse calculation:
 * level = floor(log(totalXp / multiplier) / log(base))
 *
 * @example Doubling progression with level cap
 * const curve = buildExponentialCurve({
 *   type: 'exponential',
 *   params: { base: 2, multiplier: 100 },
 *   maxLevel: 30
 * })
 * curve.xpForLevel(10) // 102400
 * curve.levelFromXp(102400) // 10
 *
 * @example Slower exponential growth
 * const curve = buildExponentialCurve({
 *   type: 'exponential',
 *   params: { base: 1.5, multiplier: 50 },
 *   maxLevel: 50
 * })
 */
export function buildExponentialCurve(config: ExponentialCurve): LevelCurve {
	// Extract required parameters
	const base = config.params.base
	const multiplier = config.params.multiplier

	// Validate parameters
	if (typeof base !== 'number' || base <= 1) {
		throw new Error('ExponentialCurve: base must be a number greater than 1')
	}
	if (typeof multiplier !== 'number' || multiplier <= 0) {
		throw new Error('ExponentialCurve: multiplier must be positive number')
	}

	// Build xpForLevel function
	const xpForLevel = (level: number): number => {
		// Handle maxLevel capping
		if (config.maxLevel !== undefined && level > config.maxLevel) {
			return Infinity
		}

		// Handle level 0 edge case (return 0 instead of multiplier * base^0)
		if (level <= 0) {
			return 0
		}

		// Apply exponential formula: multiplier * base^level
		return multiplier * Math.pow(base, level)
	}

	// Build levelFromXp function (inverse using logarithms)
	const levelFromXp = (totalXp: number): number => {
		// Handle negative/zero XP
		if (totalXp <= 0) {
			return 0
		}

		// Use logarithm for inverse: level = floor(log(totalXp / multiplier) / log(base))
		// Need to handle edge case where totalXp < multiplier (level 0 or fractional)
		if (totalXp < multiplier) {
			return 0
		}

		let level = Math.floor(Math.log(totalXp / multiplier) / Math.log(base))

		// Ensure non-negative (should be guaranteed by above check, but defensive)
		if (level < 0) {
			level = 0
		}

		// Cap at maxLevel if specified
		if (config.maxLevel !== undefined && level > config.maxLevel) {
			level = config.maxLevel
		}

		return level
	}

	return {
		xpForLevel,
		levelFromXp,
		maxLevel: config.maxLevel
	}
}

/**
 * Builds a lookup table level curve from configuration
 *
 * Uses explicit XP thresholds for each level from a predefined array.
 *
 * Provides complete control over progression with arbitrary, hand-tuned
 * values. Ideal for unique progression patterns or imported MEE6 curves.
 *
 * @param config - Lookup curve configuration
 * @returns Runtime LevelCurve with xpForLevel and levelFromXp functions
 * @throws Error if thresholds array is invalid (empty, unsorted, negative values)
 *
 * @remarks
 * The thresholds array maps level numbers to total XP required:
 * - thresholds[0] = XP for level 0 (typically 0)
 * - thresholds[1] = XP for level 1
 * - thresholds[N] = XP for level N
 *
 * Array requirements:
 * - Must be non-empty
 * - Must be sorted in ascending order
 * - All values must be non-negative numbers
 *
 * If maxLevel is omitted, it defaults to thresholds.length - 1 (the highest
 * level defined in the table). Users cannot exceed the highest defined level.
 *
 * The levelFromXp function iterates through thresholds from end to start,
 * returning the first index where totalXp >= threshold. Time complexity is O(n)
 * where n = thresholds.length, but n is typically small (<100 levels).
 *
 * @example Custom 6-level progression
 * const curve = buildLookupCurve({
 *   type: 'lookup',
 *   params: {
 *     thresholds: [0, 100, 250, 500, 1000, 2000]
 *   }
 * })
 * // Level 0: 0 XP, Level 1: 100 XP, Level 2: 250 XP, etc.
 * curve.xpForLevel(2) // 250
 * curve.levelFromXp(250) // 2
 * curve.maxLevel // 5 (thresholds.length - 1)
 *
 * @example Imported MEE6 curve with explicit maxLevel
 * const curve = buildLookupCurve({
 *   type: 'lookup',
 *   params: {
 *     thresholds: [0, 155, 220, 295, 380, 475, 580, 695, 820, 955, 1100]
 *   },
 *   maxLevel: 10
 * })
 */
export function buildLookupCurve(config: LookupCurve): LevelCurve {
	// Extract required parameter
	const thresholds = config.params.thresholds

	// Validate array existence and non-empty
	if (!Array.isArray(thresholds) || thresholds.length === 0) {
		throw new Error('LookupCurve: thresholds must be non-empty array')
	}

	// Validate all values are non-negative numbers
	for (let i = 0; i < thresholds.length; i++) {
		if (typeof thresholds[i] !== 'number' || thresholds[i] < 0) {
			throw new Error(`LookupCurve: thresholds[${i}] must be non-negative number`)
		}
	}

	// Validate array is sorted in ascending order
	for (let i = 1; i < thresholds.length; i++) {
		if (thresholds[i] < thresholds[i - 1]) {
			throw new Error('LookupCurve: thresholds must be sorted in ascending order')
		}
	}

	// Validate maxLevel if provided
	if (config.maxLevel !== undefined && config.maxLevel > thresholds.length - 1) {
		throw new Error(
			`LookupCurve: maxLevel (${config.maxLevel}) cannot exceed thresholds.length - 1 (${thresholds.length - 1})`
		)
	}

	// Calculate effective maxLevel (config.maxLevel or array length - 1)
	const effectiveMaxLevel = config.maxLevel ?? thresholds.length - 1

	// Build xpForLevel function
	const xpForLevel = (level: number): number => {
		// Handle maxLevel capping
		if (level > effectiveMaxLevel) {
			return Infinity
		}

		// Handle negative levels
		if (level < 0) {
			return 0
		}

		// Round level to integer (thresholds array uses integer indices)
		const levelInt = Math.floor(level)

		// Return threshold if in bounds
		if (levelInt < thresholds.length) {
			return thresholds[levelInt]
		}

		// Level exceeds array length, return last threshold
		return thresholds[thresholds.length - 1]
	}

	// Build levelFromXp function (iterate from end to find first threshold <= totalXp)
	const levelFromXp = (totalXp: number): number => {
		// Handle negative/zero XP
		if (totalXp <= 0) {
			return 0
		}

		// Iterate backwards through thresholds to find highest level reached
		for (let i = thresholds.length - 1; i >= 0; i--) {
			if (totalXp >= thresholds[i]) {
				// Cap at effectiveMaxLevel
				return Math.min(i, effectiveMaxLevel)
			}
		}

		// Should not reach here (totalXp > 0 should match at least thresholds[0])
		// but defensive return 0
		return 0
	}

	return {
		xpForLevel,
		levelFromXp,
		maxLevel: effectiveMaxLevel
	}
}

/**
 * Converts a curve preset config to runtime LevelCurve
 *
 * Internal helper that dispatches to appropriate builder function based on
 * the curve type discriminator.
 *
 * @param preset - Serializable curve configuration
 * @returns Runtime LevelCurve with executable functions
 * @throws Error if curve type is unknown (should never happen with TypeScript)
 *
 * @internal This function is not exported (used internally by resolveLevelCurve)
 *
 * @example
 * const preset: LevelCurveConfig = { type: 'quadratic', params: { a: 10 } }
 * const curve = buildCurveFromPreset(preset)
 * curve.xpForLevel(5) // Uses quadratic formula with a=10
 */
function buildCurveFromPreset(preset: LevelCurveConfig): LevelCurve {
	// Dispatch based on type discriminator
	switch (preset.type) {
		case 'quadratic':
			return buildQuadraticCurve(preset)

		case 'linear':
			return buildLinearCurve(preset)

		case 'exponential':
			return buildExponentialCurve(preset)

		case 'lookup':
			return buildLookupCurve(preset)

		default: {
			// TypeScript should prevent this, but defensive error
			const exhaustive: never = preset
			throw new Error(`Unknown curve type: ${(exhaustive as LevelCurveConfig).type}`)
		}
	}
}

// ============================================================================
// Curve Resolution
// ============================================================================

/**
 * Resolves level curve using three-tier precedence system
 *
 * Precedence order:
 * 1. Plugin getCurve callback (highest priority)
 * 2. Guild preset from config (medium priority)
 * 3. Default quadratic curve (lowest priority, always available)
 *
 * @param guildId - Guild ID
 * @param storeId - Store ID
 * @param guildConfig - Pre-loaded guild configuration
 * @returns Resolved LevelCurve (never null, always returns valid curve)
 *
 * @remarks
 * Error handling strategy:
 * - Each precedence level is wrapped in try-catch
 * - Errors are logged with context (guildId, storeId, step)
 * - On error, continue to next precedence level
 * - Always returns a valid curve (default quadratic as final fallback)
 *
 * The getCurve callback can be either sync or async. This function uses await
 * to handle both cases uniformly.
 *
 * This function is exported for use by higher-level systems that need direct
 * access to curve resolution logic. Most consumers should use getResolvedCurve()
 * which provides caching.
 *
 * @example getCurve callback takes precedence
 * // Plugin config: levels.getCurve = (guildId, storeId) => customCurve
 * // Guild config: levels = { type: 'linear', params: { xpPerLevel: 100 } }
 * // Result: Uses customCurve from getCurve (ignores guild preset)
 *
 * @example Guild preset when no getCurve
 * // Plugin config: levels.getCurve = undefined
 * // Guild config: levels = { type: 'linear', params: { xpPerLevel: 100 } }
 * // Result: Uses linear curve from guild config
 *
 * @example Default fallback
 * // Plugin config: levels.getCurve = undefined
 * // Guild config: levels = undefined
 * // Result: Uses default quadratic (standard formula)
 */
export async function resolveLevelCurve(guildId: string, storeId: string, guildConfig: GuildConfig): Promise<LevelCurve> {
	// Step 1: Try plugin getCurve callback (highest priority)
	try {
		const options = getPluginOptions('@robojs/xp') as PluginOptions | undefined
		const getCurve = options?.levels?.getCurve

		if (getCurve) {
			// Call getCurve (handle both sync and async)
			const getCurveResult = await getCurve(guildId, storeId)

			// If getCurve returns non-null curve, use it
			if (getCurveResult) {
				xpLogger.debug(`Using getCurve callback for guild ${guildId} store ${storeId}`)
				return getCurveResult
			}
		}
	} catch (error) {
		// Log error but continue to next precedence level
		xpLogger.error('Failed to resolve curve from getCurve callback', { guildId, storeId, error })
	}

	// Step 2: Try guild preset (medium priority)
	try {
		if (guildConfig.levels) {
			const curve = buildCurveFromPreset(guildConfig.levels)
			xpLogger.debug(`Resolved curve for guild ${guildId} store ${storeId}: ${guildConfig.levels.type}`)
			return curve
		}
	} catch (error) {
		// Log error but continue to default
		xpLogger.error('Failed to build curve from preset', { guildId, storeId, preset: guildConfig.levels, error })
	}

	// Step 3: Default quadratic (lowest priority, always succeeds)
	xpLogger.debug(`Using default quadratic curve for guild ${guildId} store ${storeId}`)
	return buildQuadraticCurve({ type: 'quadratic' })
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Gets resolved level curve for a guild and store
 *
 * This is the primary entry point for accessing level curves. Returns cached
 * curve if available, otherwise resolves using three-tier precedence and caches result.
 *
 * @param guildId - Guild ID
 * @param storeId - Store ID (defaults to 'default')
 * @returns Resolved LevelCurve with xpForLevel and levelFromXp functions
 *
 * @remarks
 * Caching behavior:
 * - First call: Loads config, resolves curve, caches result, returns curve
 * - Subsequent calls: Returns cached curve immediately (no I/O)
 * - Cache persists until restart or explicit invalidation
 *
 * Three-tier precedence (see resolveLevelCurve for details):
 * 1. Plugin getCurve callback (code-based, dynamic)
 * 2. Guild preset (Flashcore, per guild/store)
 * 3. Default quadratic (standard formula, always available)
 *
 * Always returns a valid curve. Never throws errors (returns default on failures).
 *
 * @example Get curve for default store
 * const curve = await getResolvedCurve('123456789')
 * const xpNeeded = curve.xpForLevel(10) // XP needed for level 10
 * const level = curve.levelFromXp(1500) // Level from 1500 total XP
 *
 * @example Get curve for custom store
 * const curve = await getResolvedCurve('123456789', 'reputation')
 * if (curve.maxLevel) {
 *   console.log(`Max level: ${curve.maxLevel}`)
 * }
 *
 * @example Use in XP calculations
 * const curve = await getResolvedCurve(guildId, storeId)
 * const currentLevel = curve.levelFromXp(user.totalXp)
 * const nextLevelXp = curve.xpForLevel(currentLevel + 1)
 * const xpToNext = nextLevelXp - user.totalXp
 */
export async function getResolvedCurve(guildId: string, storeId: string = 'default'): Promise<LevelCurve> {
	// Step 1: Check cache
	const cacheKey = getCurveKey(guildId, storeId)
	const cached = curveCache.get(cacheKey)

	if (cached) {
		return cached
	}

	// Step 2: Load guild config
	const config = await getConfig(guildId, { storeId })

	// Step 3: Resolve curve using three-tier precedence
	const curve = await resolveLevelCurve(guildId, storeId, config)

	// Step 4: Cache result
	curveCache.set(cacheKey, curve)

	// Step 5: Return resolved curve
	return curve
}

/**
 * Invalidates cached curve for a specific guild and store
 *
 * Forces next getResolvedCurve call to re-resolve the curve from config/getCurve.
 * Call this after updating guild configuration to ensure changes take effect.
 *
 * @param guildId - Guild ID to invalidate
 * @param storeId - Store ID to invalidate (if omitted, invalidates all stores for guild)
 *
 * @remarks
 * Invalidation strategy:
 * - If storeId provided: Delete specific cache entry
 * - If storeId omitted: Delete all cache entries for guild (all stores)
 *
 * This should be called from:
 * - Config update functions (subsequent phase)
 * - Admin commands that modify level curves
 * - Migration functions that alter curve settings
 *
 * @example Invalidate specific store
 * invalidateCurveCache('123456789', 'default')
 * // Next getResolvedCurve('123456789', 'default') will re-resolve
 *
 * @example Invalidate all stores for guild
 * invalidateCurveCache('123456789')
 * // Clears cache for 'default', 'reputation', and any other stores
 */
export function invalidateCurveCache(guildId: string, storeId?: string): void {
	if (storeId !== undefined) {
		// Invalidate specific store
		const cacheKey = getCurveKey(guildId, storeId)
		curveCache.delete(cacheKey)
		xpLogger.debug(`Invalidated curve cache for guild ${guildId} store ${storeId}`)
	} else {
		// Invalidate all stores for guild
		const prefix = `${guildId}${CACHE_KEY_SEPARATOR}`
		const keysToDelete: string[] = []

		for (const key of curveCache.keys()) {
			if (key.startsWith(prefix)) {
				keysToDelete.push(key)
			}
		}

		for (const key of keysToDelete) {
			curveCache.delete(key)
		}

		xpLogger.debug(`Invalidated curve cache for all stores in guild ${guildId} (${keysToDelete.length} entries)`)
	}
}

/**
 * Clears all cached curves
 *
 * Removes all entries from the curve cache, forcing all subsequent
 * getResolvedCurve calls to re-resolve from config/getCurve.
 *
 * @remarks
 * Use cases:
 * - Global config changes (e.g., plugin options update)
 * - Testing (reset state between tests)
 * - Development (force cache refresh)
 * - Memory management (if cache grows very large)
 *
 * Generally not needed in production (selective invalidation is preferred).
 *
 * @example Clear all curves
 * clearAllCurveCache()
 * // All subsequent getResolvedCurve calls will re-resolve
 */
export function clearAllCurveCache(): void {
	const count = curveCache.size
	curveCache.clear()
	xpLogger.debug(`Cleared all curve cache entries (${count} total)`)
}
