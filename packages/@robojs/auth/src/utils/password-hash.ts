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
	Tuning knobs for the Argon2id hash function used throughout the auth plugin.

	@example
	```ts
	const params: Argon2Params = { memorySize: 8192, passes: 4, parallelism: 1, tagLength: 32 }
	```
*/
export interface Argon2Params {
	memorySize: number
	passes: number
	parallelism: number
	tagLength: number
}

/**
	Optional overrides when hashing passwords, enabling stronger parameters or custom salts.

	@example
	```ts
	await hashPassword('hunter2', { parameters: { passes: 5 } })
	```
*/
export interface HashPasswordOptions {
	parameters?: Partial<Argon2Params>
	salt?: Uint8Array
}

/**
	Structured representation of a serialized Argon2id hash string.

	@example
	```ts
	const parsed = parseArgon2idHash(storedHash)
	if (parsed?.params.passes < 4) console.warn('legacy hash detected')
	```
*/
export interface PasswordHashMetadata {
	algorithm: 'argon2id'
	params: Argon2Params
	salt: Uint8Array
	hash: Uint8Array
}

/** Default Argon2id parameters chosen to balance security and performance. */
const DEFAULT_ARGON2_PARAMS: Argon2Params = {
	memorySize: ARGON2_MEMORY_KIB,
	passes: ARGON2_TIME_COST,
	parallelism: ARGON2_PARALLELISM,
	tagLength: ARGON2_TAG_LENGTH
}

let argon2InstancePromise: Promise<Argon2ComputeHash> | null = null

// Resolve the WebAssembly-backed Argon2 implementation once and reuse it between calls.
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

// Apply caller overrides while falling back to recommended defaults.
function resolveParams(params: Partial<Argon2Params> | undefined): Argon2Params {
	return {
		memorySize: params?.memorySize ?? DEFAULT_ARGON2_PARAMS.memorySize,
		passes: params?.passes ?? DEFAULT_ARGON2_PARAMS.passes,
		parallelism: params?.parallelism ?? DEFAULT_ARGON2_PARAMS.parallelism,
		tagLength: params?.tagLength ?? DEFAULT_ARGON2_PARAMS.tagLength
	}
}

// Normalize text input to bytes using a stable Unicode normalization form.
function passwordToBytes(password: string): Uint8Array {
	return new TextEncoder().encode(password.normalize('NFKC'))
}

// Execute Argon2 with the resolved runtime parameters, returning the raw digest.
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

// Emit a standards-compliant Argon2id hash string from raw components.
function formatArgon2idHash(salt: Uint8Array, hash: Uint8Array, params: Argon2Params): string {
	const saltB64 = Buffer.from(salt).toString('base64')
	const hashB64 = Buffer.from(hash).toString('base64')

	return `$argon2id$v=${ARGON2_VERSION}$m=${params.memorySize},t=${params.passes},p=${params.parallelism}$${saltB64}$${hashB64}`
}

/**
	Parses a serialized Argon2id hash and exposes its parameters, salt, and digest bytes.

	@example
	```ts
	const metadata = parseArgon2idHash(hashString)
	if (metadata) console.info(metadata.params)
	```
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
	Generates an Argon2id hash string for the provided password.

	@example
	```ts
	const hash = await hashPassword('super_secret_password')
	```

	@example
	```ts
	const hash = await hashPassword('super_secret_password', { parameters: { passes: 5 } })
	```
*/
export async function hashPassword(password: string, options?: HashPasswordOptions): Promise<string> {
	// Resolve the effective cost parameters before hashing.
	const params = resolveParams(options?.parameters)
	const salt = options?.salt ?? randomBytes(ARGON2_SALT_LENGTH)
	const digest = await computeHash(password, salt, params)

	return formatArgon2idHash(salt, digest, params)
}

/**
	Validates a plaintext password against a previously generated Argon2id hash.

	@example
	```ts
	const isValid = await verifyPasswordHash('guess', storedHash)
	```
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
	Detects whether an existing hash should be regenerated to match newer tuning parameters.

	@example
	```ts
	if (needsRehash(hash, { memorySize: 8192 })) {
		const updated = await hashPassword(password, { parameters: { memorySize: 8192 } })
	}
	```
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
