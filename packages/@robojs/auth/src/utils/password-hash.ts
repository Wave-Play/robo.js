import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import setupWasm from 'argon2id/lib/setup.js'
import type { computeHash as Argon2ComputeHash } from 'argon2id'

const require = createRequire(import.meta.url)

const ARGON2_VERSION = 19
const ARGON2_MEMORY_KIB = 4096
const ARGON2_TIME_COST = 3
const ARGON2_PARALLELISM = 1
const ARGON2_TAG_LENGTH = 32
const ARGON2_SALT_LENGTH = 16

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

let argon2InstancePromise: Promise<Argon2ComputeHash> | null = null

/**
 * Lazily loads the WebAssembly-backed Argon2id implementation, preferring the
 * SIMD build and falling back to the no-SIMD variant. The resulting promise is
 * cached so subsequent hashes reuse the same instance (~2x faster after warmup).
 */
function getArgon2Instance() {
	if (!argon2InstancePromise) {
		argon2InstancePromise = setupWasm(
			(importObject) => WebAssembly.instantiate(readFileSync(require.resolve('argon2id/dist/simd.wasm')), importObject),
			(importObject) =>
				WebAssembly.instantiate(readFileSync(require.resolve('argon2id/dist/no-simd.wasm')), importObject)
		)
	}

	return argon2InstancePromise
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

/** Executes Argon2id with the provided parameters, returning raw digest bytes. */
async function computeHash(password: string, salt: Uint8Array, params: Argon2Params): Promise<Uint8Array> {
	const argon2 = await getArgon2Instance()
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

/** Formats salt, digest, and params into a PHC-compliant Argon2id hash string. */
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
 * Edge cases:
 * - Non-argon2id hashes return `null` (use this to detect legacy bcrypt/scrypt hashes).
 * - Missing/invalid base64 segments return `null`.
 * - Tag length is inferred from the digest length and may not match the
 *   originally declared parameter if the string was tampered with.
 *
 * @param hash - Argon2id hash string in `$argon2id$v=19$...` format.
 * @returns {@link PasswordHashMetadata} or `null`.
 *
 * @example Inspect stored parameters
 * ```ts
 * const metadata = parseArgon2idHash(hashString)
 * console.log(metadata?.params)
 * ```
 *
 * @see PasswordHashMetadata
 * @see needsRehash
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
 * Generates a PHC-formatted Argon2id hash string for a plaintext password.
 * Uses secure defaults ({@link DEFAULT_ARGON2_PARAMS}) and embeds all metadata
 * (algorithm, version, parameters, salt, digest) in the result.
 *
 * ⚠️ Security:
 * - Never store plaintext passwords; always hash server-side over HTTPS.
 * - Hash string contains salt/parameters but not the password—safe to store in DB.
 * - Use high-entropy secrets; consider rate limiting signup/reset endpoints.
 *
 * Performance:
 * - First call initializes the WASM module (~10 ms). Subsequent calls take
 *   ~50 ms with default parameters, longer if you raise costs.
 * - Hashing is CPU/RAM intensive and blocks the event loop; use worker threads
 *   if performing many parallel operations.
 *
 * Edge cases:
 * - Accepts any string (including empty), but you should enforce password policies upstream.
 * - Unicode is normalized via NFKC, so visually identical strings hash equally.
 * - Extremely long passwords (>1 kB) increase hashing time; consider capping length.
 *
 * @param password - Plaintext password (will be normalized to NFKC).
 * @param options - Optional {@link HashPasswordOptions} (custom parameters/salt).
 * @returns Argon2id hash string (`$argon2id$...`).
 *
 * @example Basic usage
 * ```ts
 * const hash = await hashPassword('super_secret_password')
 * await prisma.user.update({ where: { id }, data: { passwordHash: hash } })
 * ```
 *
 * @example Increase security parameters
 * ```ts
 * const hash = await hashPassword('password', { parameters: { memorySize: 8192, passes: 4 } })
 * ```
 *
 * @example Signup flow helper
 * ```ts
 * async function signup(email: string, password: string) {
 * 	const hash = await hashPassword(password)
 * 	return prisma.user.create({ data: { email, passwordHash: hash } })
 * }
 * ```
 *
 * @example Password change
 * ```ts
 * await prisma.user.update({
 * 	where: { id: userId },
 * 	data: { passwordHash: await hashPassword(newPassword) }
 * })
 * ```
 *
 * @see verifyPasswordHash
 * @see needsRehash
 * @see Argon2Params
 */
export async function hashPassword(password: string, options?: HashPasswordOptions): Promise<string> {
	// Resolve the effective cost parameters before hashing.
	const params = resolveParams(options?.parameters)
	const salt = options?.salt ?? randomBytes(ARGON2_SALT_LENGTH)
	const digest = await computeHash(password, salt, params)

	return formatArgon2idHash(salt, digest, params)
}

/**
 * Validates a password against a stored Argon2id hash using timing-safe
 * comparison. Supports hashes generated by {@link hashPassword} (or any PHC
 * compliant Argon2id implementation).
 *
 * ⚠️ Security:
 * - Uses {@link timingSafeEqual}; never compare hashes with `===`.
 * - Returns `false` for invalid hashes to avoid leaking details; map all
 *   failures to a generic "invalid credentials" response.
 * - Combine with rate limiting (e.g., 5 attempts/min) to mitigate brute-force attacks.
 *
 * Performance:
 * - Verification time roughly matches hashing time (~50 ms with defaults).
 * - First call pays the WASM warmup cost just like {@link hashPassword}.
 *
 * Edge cases:
 * - Returns `false` for corrupted hashes or other algorithms (bcrypt, scrypt);
 *   provide a password reset path for impacted users.
 * - Unicode passwords are normalized via NFKC before hashing/verification.
 * - Pair with {@link needsRehash} to upgrade weak hashes after successful login.
 *
 * @param password - Plaintext password supplied by the user.
 * @param storedHash - Argon2id hash string from your database.
 * @returns `true` if the password matches, otherwise `false`.
 *
 * @example Basic login check
 * ```ts
 * if (!user || !(await verifyPasswordHash(inputPassword, user.passwordHash))) {
 * 	throw new Error('Invalid credentials')
 * }
 * ```
 *
 * @example Auto-rehash on login
 * ```ts
 * if (await verifyPasswordHash(password, user.hash) && needsRehash(user.hash, newParams)) {
 * 	await prisma.user.update({ id: user.id, data: { hash: await hashPassword(password, { parameters: newParams }) } })
 * }
 * ```
 *
 * @example Rate limiting stub
 * ```ts
 * const attempts = await redis.incr(`login:${email}`)
 * if (attempts > 5) throw new Error('Too many attempts')
 * const ok = await verifyPasswordHash(password, user.passwordHash)
 * if (ok) await redis.del(`login:${email}`)
 * ```
 *
 * @see hashPassword
 * @see needsRehash
 * @see parseArgon2idHash
 */
export async function verifyPasswordHash(password: string, storedHash: string): Promise<boolean> {
	const parsed = parseArgon2idHash(storedHash)
	if (!parsed) return false
	// Recompute the digest with the original salt and parameters.
	const digest = await computeHash(password, parsed.salt, parsed.params)
	if (digest.length !== parsed.hash.length) return false

	return timingSafeEqual(Buffer.from(digest), Buffer.from(parsed.hash))
}

/**
 * Determines whether a stored Argon2id hash needs to be regenerated to meet
 * newer parameter requirements. Useful when raising security settings without
 * forcing global password resets.
 *
 * ⚠️ Security:
 * - Only rehash after successfully verifying the user's password.
 * - Treat `true` results for invalid hashes as a signal to force password reset.
 *
 * Performance:
 * - Rehashing adds extra latency (~50–100 ms) during the first login after a
 *   parameter change. For huge user bases consider a background migration job.
 *
 * Edge cases:
 * - Returns `true` for malformed/non-argon2id hashes so you can migrate them.
 * - `reference` is merged with {@link DEFAULT_ARGON2_PARAMS}; omit fields that
 *   you don't care about.
 * - Tag length comparisons use the stored digest length; tampered hashes may
 *   trigger false positives.
 *
 * @param hash - Stored Argon2id hash string.
 * @param reference - Desired Argon2 params (partial allowed). Defaults to {@link DEFAULT_ARGON2_PARAMS}.
 * @returns `true` if the hash should be regenerated, else `false`.
 *
 * @example On-demand upgrades during login
 * ```ts
 * if (await verifyPasswordHash(password, user.hash) && needsRehash(user.hash, { memorySize: 8192 })) {
 * 	await prisma.user.update({ id: user.id, data: { hash: await hashPassword(password, { parameters: { memorySize: 8192 } }) } })
 * }
 * ```
 *
 * @example Audit tool
 * ```ts
 * const weak = users.filter((user) => needsRehash(user.passwordHash, { passes: 4 }))
 * ```
 *
 * @example Background migration planning
 * ```ts
 * for (const user of users) {
 * 	if (needsRehash(user.passwordHash, { memorySize: 8192 })) {
 * 		console.log(`User ${user.id} will be upgraded on next login`)
 * 	}
 * }
 * ```
 *
 * @see hashPassword
 * @see verifyPasswordHash
 * @see parseArgon2idHash
 */
export function needsRehash(hash: string, reference: Partial<Argon2Params> = {}): boolean {
	const parsed = parseArgon2idHash(hash)
	if (!parsed) return true
	const params = resolveParams(reference)

	// Compare stored tuning knobs against the desired reference configuration.
	return (
		parsed.params.memorySize !== params.memorySize ||
		parsed.params.passes !== params.passes ||
		parsed.params.parallelism !== params.parallelism ||
		parsed.hash.length !== params.tagLength
	)
}

/** Re-exported primitives for advanced tuning of the password hashing pipeline. */
export { ARGON2_SALT_LENGTH, DEFAULT_ARGON2_PARAMS }
export type { Argon2Params as PasswordHashParams }
