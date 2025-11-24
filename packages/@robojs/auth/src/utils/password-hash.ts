import { randomBytes, timingSafeEqual } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)

const ARGON2_VERSION = 19
const ARGON2_MEMORY_KIB = 4096
const ARGON2_TIME_COST = 3
const ARGON2_PARALLELISM = 1
const ARGON2_TAG_LENGTH = 32
const ARGON2_SALT_LENGTH = 16

/**
 * Interface for password hashing implementations.
 * Allows swapping the default Argon2id hasher with custom logic (e.g. bcrypt, scrypt).
 */
export interface PasswordHasher {
	/**
	 * Hashes a plaintext password.
	 * @param password - The plaintext password to hash.
	 */
	hash(password: string): Promise<string>

	/**
	 * Verifies a plaintext password against a stored hash.
	 * @param password - The plaintext password to verify.
	 * @param storedHash - The stored hash to compare against.
	 */
	verify(password: string, storedHash: string): Promise<boolean>

	/**
	 * Checks if a stored hash needs to be rehashed (e.g. due to parameter upgrades).
	 * @param storedHash - The stored hash to check.
	 */
	needsRehash(storedHash: string): boolean
}

/**
 * Argon2id default constants used across the auth package.
 *
 * - `ARGON2_VERSION`: Algorithm version (19 = Argon2 v1.3).
 * - `ARGON2_MEMORY_KIB`: Memory cost in KiB (4096 = 4 MiB).
 * - `ARGON2_TIME_COST`: Time cost/number of passes (3).
 * - `ARGON2_PARALLELISM`: Number of threads (1).
 * - `ARGON2_TAG_LENGTH`: Hash length in bytes (32 = 256 bits).
 * - `ARGON2_SALT_LENGTH`: Salt size in bytes (16 = 128 bits).
 *
 * Increase these values for higher security (at the expense of CPU/RAM) per
 * OWASP Password Storage recommendations.
 */

/**
 * Tuning parameters for the Argon2id hashing algorithm. Higher settings
 * increase resistance to brute-force attacks but also raise CPU/RAM costs.
 *
 * Fields:
 * - `memorySize`: Memory cost in KiB. Default 4096 (4 MiB). Increase to 8192+ for high-security apps.
 * - `passes`: Number of iterations/time cost. Default 3. Raising this linearly increases hashing time.
 * - `parallelism`: Thread count. Default 1. Increase on multi-core servers; keep ≤ available cores.
 * - `tagLength`: Output hash length in bytes. Default 32 (256 bits). Use 32 or 64 for most cases.
 *
 * ⚠️ Security:
 * - Memory cost is the strongest defense against GPU attacks; use the highest value your infra tolerates.
 * - Never drop below 4096 KiB / 3 passes / 1 parallelism / 32-byte tag.
 * - Changing parameters requires rehashing existing passwords (see {@link needsRehash}).
 *
 * Performance:
 * - 4096 KiB with 3 passes hashes in ~50 ms on typical servers; 8192 KiB doubles that.
 * - High parallelism increases RAM usage proportionally.
 *
 * @example Default-strength parameters
 * ```ts
 * const params: Argon2Params = { memorySize: 4096, passes: 3, parallelism: 1, tagLength: 32 }
 * ```
 *
 * @example High-security profile
 * ```ts
 * const params: Argon2Params = { memorySize: 8192, passes: 4, parallelism: 1, tagLength: 32 }
 * ```
 *
 * @see DEFAULT_ARGON2_PARAMS
 * @see hashPassword
 */
export interface Argon2Params {
	memorySize: number
	passes: number
	parallelism: number
	tagLength: number
}

/**
 * Optional overrides when calling {@link hashPassword}.
 *
 * - `parameters?`: Provide partial {@link Argon2Params} to override defaults
 *   (e.g., increase `memorySize`). Omitted fields fall back to
 *   {@link DEFAULT_ARGON2_PARAMS}.
 * - `salt?`: Provide a custom 16-byte salt. Normally auto-generated; only use
 *   for deterministic migrations/testing.
 *
 * ⚠️ Security:
 * - Custom salts must be cryptographically random and unique per password.
 * - Avoid predictable salts (email, userId, timestamps) to prevent rainbow-table attacks.
 * - Keep parameter overrides consistent across all app instances.
 *
 * Edge cases:
 * - Providing `salt` disables auto-generation. Ensure it is exactly
 *   {@link ARGON2_SALT_LENGTH} bytes or Argon2 will throw.
 * - Partial `parameters` are merged with defaults; unspecified fields retain
 *   secure defaults.
 *
 * @example Increase memory cost
 * ```ts
 * await hashPassword('hunter2', { parameters: { memorySize: 8192 } })
 * ```
 *
 * @example Provide deterministic salt for tests
 * ```ts
 * const salt = new Uint8Array(16).fill(0)
 * await hashPassword('hunter2', { salt })
 * ```
 */
export interface HashPasswordOptions {
	parameters?: Partial<Argon2Params>
	salt?: Uint8Array
}

/**
 * Structured representation of a PHC-formatted Argon2id hash string. Useful
 * for inspecting hash strength, performing migrations, or validating formats.
 *
 * Fields:
 * - `algorithm`: Always `'argon2id'` for this implementation.
 * - `params`: Parsed {@link Argon2Params} showing the effective security level.
 * - `salt`: Raw salt bytes (16 bytes by default).
 * - `hash`: Raw digest bytes (length = `params.tagLength`).
 *
 * Edge cases:
 * - {@link parseArgon2idHash} returns `null` for invalid or non-argon2id
 *   hashes; always null-check before accessing fields.
 * - Tag length is inferred from the digest length and may differ from the
 *   original parameter if tampered with.
 *
 * @example Warn on legacy hashes
 * ```ts
 * const metadata = parseArgon2idHash(storedHash)
 * if (metadata && metadata.params.memorySize < 4096) {
 * 	console.warn('Legacy hash detected')
 * }
 * ```
 *
 * @see parseArgon2idHash
 * @see needsRehash
 */
export interface PasswordHashMetadata {
	algorithm: 'argon2id'
	params: Argon2Params
	salt: Uint8Array
	hash: Uint8Array
}

/**
 * Default Argon2id parameters derived from OWASP's password storage guidance.
 * Provide a solid balance between security (~50 ms hashing time) and
 * performance for typical web workloads. Increase `memorySize` or `passes`
 * when targeting high-risk environments.
 *
 * @see Argon2Params
 * @see OWASP Password Storage guidelines
 */
const DEFAULT_ARGON2_PARAMS: Argon2Params = {
	memorySize: ARGON2_MEMORY_KIB,
	passes: ARGON2_TIME_COST,
	parallelism: ARGON2_PARALLELISM,
	tagLength: ARGON2_TAG_LENGTH
}

/** Merges user-provided Argon2 param overrides with {@link DEFAULT_ARGON2_PARAMS}. */
function resolveParams(params: Partial<Argon2Params> | undefined): Argon2Params {
	return {
		memorySize: params?.memorySize ?? DEFAULT_ARGON2_PARAMS.memorySize,
		passes: params?.passes ?? DEFAULT_ARGON2_PARAMS.passes,
		parallelism: params?.parallelism ?? DEFAULT_ARGON2_PARAMS.parallelism,
		tagLength: params?.tagLength ?? DEFAULT_ARGON2_PARAMS.tagLength
	}
}

/** Converts a password string to UTF-8 bytes using Unicode NFKC normalization. */
function passwordToBytes(password: string): Uint8Array {
	return new TextEncoder().encode(password.normalize('NFKC'))
}

/**
 * Formats salt, digest, and params into a PHC-compliant Argon2id hash string.
 */
function formatArgon2idHash(salt: Uint8Array, hash: Uint8Array, params: Argon2Params): string {
	const saltB64 = Buffer.from(salt).toString('base64')
	const hashB64 = Buffer.from(hash).toString('base64')

	return `$argon2id$v=${ARGON2_VERSION}$m=${params.memorySize},t=${params.passes},p=${params.parallelism}$${saltB64}$${hashB64}`
}

/**
 * Parses a PHC-formatted Argon2id hash string and extracts algorithm,
 * parameters, salt, and digest bytes. Returns `null` for invalid inputs or
 * other Argon2 variants (`argon2i`, `argon2d`).
 *
 * @param hash - Argon2id hash string in `$argon2id$v=19$...` format.
 * @returns {@link PasswordHashMetadata} or `null`.
 */
export function parseArgon2idHash(hash: string): PasswordHashMetadata | null {
	if (!hash.startsWith('$argon2')) return null
	const segments = hash.split('$')
	if (segments.length < 6) return null
	const algorithm = segments[1]
	if (algorithm !== 'argon2id') return null
	// Extract `m`, `t`, and `p` tuning values from the serialized segment.
	const paramPairs = segments[3]?.split(',') ?? []
	const resolved: Partial<Argon2Params> = {}
	for (const entry of paramPairs) {
		const [key, value] = entry.split('=')
		const numeric = Number(value)
		if (!Number.isFinite(numeric)) continue
		if (key === 'm') resolved.memorySize = numeric
		if (key === 't') resolved.passes = numeric
		if (key === 'p') resolved.parallelism = numeric
	}
	const saltB64 = segments[4]
	const hashB64 = segments[5]
	if (!saltB64 || !hashB64) return null
	// Decode the base64 payloads into raw binary data for downstream consumers.
	const salt = Buffer.from(saltB64, 'base64')
	const digest = Buffer.from(hashB64, 'base64')
	if (!salt.length || !digest.length) return null
	const params: Argon2Params = {
		memorySize: resolved.memorySize ?? ARGON2_MEMORY_KIB,
		passes: resolved.passes ?? ARGON2_TIME_COST,
		parallelism: resolved.parallelism ?? ARGON2_PARALLELISM,
		tagLength: digest.length
	}

	return { algorithm: 'argon2id', params, salt: new Uint8Array(salt), hash: new Uint8Array(digest) }
}

/**
 * Default implementation of {@link PasswordHasher} using Argon2id.
 * Lazily loads the WebAssembly backend only when needed.
 */
export class Argon2Hasher implements PasswordHasher {
	private _instancePromise: Promise<import('argon2id').computeHash> | null = null
	private _options: HashPasswordOptions

	constructor(options: HashPasswordOptions = {}) {
		this._options = options
	}

	/**
	 * Lazily loads the WebAssembly-backed Argon2id implementation, preferring the
	 * SIMD build and falling back to the no-SIMD variant. The resulting promise is
	 * cached so subsequent hashes reuse the same instance.
	 */
	private async _getInstance() {
		if (!this._instancePromise) {
			const { readFileSync } = await import('node:fs')
			const setupWasm = (await import('argon2id/lib/setup.js')).default

			this._instancePromise = setupWasm(
				(importObject) =>
					WebAssembly.instantiate(readFileSync(require.resolve('argon2id/dist/simd.wasm')), importObject),
				(importObject) =>
					WebAssembly.instantiate(readFileSync(require.resolve('argon2id/dist/no-simd.wasm')), importObject)
			)
		}
		return this._instancePromise
	}

	private async _computeHash(password: string, salt: Uint8Array, params: Argon2Params): Promise<Uint8Array> {
		const argon2 = await this._getInstance()
		const digest = argon2({
			password: passwordToBytes(password),
			salt,
			parallelism: params.parallelism,
			passes: params.passes,
			memorySize: params.memorySize,
			tagLength: params.tagLength
		})

		return Uint8Array.from(digest)
	}

	async hash(password: string): Promise<string> {
		const params = resolveParams(this._options.parameters)
		const salt = this._options.salt ?? randomBytes(ARGON2_SALT_LENGTH)
		const digest = await this._computeHash(password, salt, params)

		return formatArgon2idHash(salt, digest, params)
	}

	async verify(password: string, storedHash: string): Promise<boolean> {
		const parsed = parseArgon2idHash(storedHash)
		if (!parsed) return false
		// Recompute the digest with the original salt and parameters.
		const digest = await this._computeHash(password, parsed.salt, parsed.params)
		if (digest.length !== parsed.hash.length) return false

		return timingSafeEqual(Buffer.from(digest), Buffer.from(parsed.hash))
	}

	needsRehash(storedHash: string): boolean {
		const parsed = parseArgon2idHash(storedHash)
		if (!parsed) return true
		const params = resolveParams(this._options.parameters)

		// Compare stored tuning knobs against the desired reference configuration.
		return (
			parsed.params.memorySize !== params.memorySize ||
			parsed.params.passes !== params.passes ||
			parsed.params.parallelism !== params.parallelism ||
			parsed.hash.length !== params.tagLength
		)
	}
}

// Shared instance for backward compatibility
let defaultHasher: Argon2Hasher | null = null

function getDefaultHasher() {
	if (!defaultHasher) {
		defaultHasher = new Argon2Hasher()
	}
	return defaultHasher
}

/**
 * Generates a PHC-formatted Argon2id hash string for a plaintext password.
 * @deprecated Use `Argon2Hasher` or a custom `PasswordHasher` instead.
 */
export async function hashPassword(password: string, options?: HashPasswordOptions): Promise<string> {
	const hasher = options ? new Argon2Hasher(options) : getDefaultHasher()
	return hasher.hash(password)
}

/**
 * Validates a password against a stored Argon2id hash.
 * @deprecated Use `Argon2Hasher` or a custom `PasswordHasher` instead.
 */
export async function verifyPasswordHash(password: string, storedHash: string): Promise<boolean> {
	return getDefaultHasher().verify(password, storedHash)
}

/**
 * Determines whether a stored Argon2id hash needs to be regenerated.
 * @deprecated Use `Argon2Hasher` or a custom `PasswordHasher` instead.
 */
export function needsRehash(hash: string, reference: Partial<Argon2Params> = {}): boolean {
	const hasher = new Argon2Hasher({ parameters: reference })
	return hasher.needsRehash(hash)
}

/** Re-exported primitives for advanced tuning of the password hashing pipeline. */
export { ARGON2_SALT_LENGTH, DEFAULT_ARGON2_PARAMS }
export type { Argon2Params as PasswordHashParams }
