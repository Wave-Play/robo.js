import fs from 'node:fs/promises'
import path from 'node:path'
import { randomBytes, randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import { logger } from '../../core/logger.js'
import type { Manifest } from '../../types/index.js'
import { PackageDir } from './utils.js'

export interface NormalizedSeedHookVariable {
	description?: string
	overwrite?: boolean
	value: string
}

export interface NormalizedSeedHookResult {
	env?: {
		description?: string
		variables: Record<string, NormalizedSeedHookVariable>
	}
}

interface SeedHookApi {
	generators: {
		randomBase64: (bytes?: number) => string
		randomHex: (bytes?: number) => string
		randomUUID: () => string
	}
	log: (...args: unknown[]) => void
}

export async function runSeedHook(
	packageName: string,
	manifest: Manifest,
	basePath?: string
): Promise<NormalizedSeedHookResult | null> {
	const hookPathInManifest = manifest.__robo?.seed?.hook ?? manifest.__robo?.seed?.env?.hook

	if (!hookPathInManifest) {
		return null
	}

	const hookPathCandidates = await resolveHookCandidates(packageName, hookPathInManifest, basePath)

	for (const hookPath of hookPathCandidates) {
		try {
			const api = createSeedHookApi(packageName)
			const previousHelpers = (globalThis as Record<string, unknown>).__roboSeedHelpers

			try {
				Object.defineProperty(globalThis, '__roboSeedHelpers', {
					configurable: true,
					value: api
				})

				const moduleUrl = createCacheBustingUrl(hookPath)
				const namespace = await import(moduleUrl)
				const exported = namespace?.default ?? (namespace as Record<string, unknown>)?.run

				if (typeof exported !== 'function') {
					logger.warn(`Seed hook at ${hookPath} did not export a function. Skipping.`)
					continue
				}

				const result = await exported(api)
				return normalizeHookResult(result)
			} finally {
				if (previousHelpers === undefined) {
					delete (globalThis as Record<string, unknown>).__roboSeedHelpers
				} else {
					Object.defineProperty(globalThis, '__roboSeedHelpers', {
						configurable: true,
						value: previousHelpers
					})
				}
			}
		} catch (error) {
			logger.warn(`Failed to execute seed hook for ${packageName} at ${hookPath}:`, error)
		}
	}

	return null
}

function createSeedHookApi(packageName: string): SeedHookApi {
	return {
		generators: {
			randomBase64(bytes = 32) {
				const buffer = randomBytes(Math.max(1, bytes))
				return buffer.toString('base64').replace(/=+$/u, '')
			},
			randomHex(bytes = 32) {
				const buffer = randomBytes(Math.max(1, bytes))
				return buffer.toString('hex')
			},
			randomUUID() {
				return randomUUID()
			}
		},
		log: (...args: unknown[]) => {
			logger.debug(`[seed:${packageName}]`, ...args)
		}
	}
}

function createCacheBustingUrl(filePath: string) {
	const url = pathToFileURL(filePath).href
	const separator = url.includes('?') ? '&' : '?'
	return `${url}${separator}seedHook=${Date.now()}`
}

async function resolveHookCandidates(packageName: string, hookPath: string, explicitBasePath?: string): Promise<string[]> {
	const normalized = hookPath.replace(/^[\\/]+/, '').replace(/\\/g, path.sep)
	const candidates = new Set<string>()

	const basePaths = new Set<string>()

	if (explicitBasePath) {
		basePaths.add(explicitBasePath)
	}

	if (packageName.startsWith('.') || packageName.startsWith('/')) {
		basePaths.add(path.resolve(process.cwd(), packageName))
	} else {
		basePaths.add(path.resolve(PackageDir, '..', packageName))
		basePaths.add(path.resolve(process.cwd(), 'node_modules', packageName))
	}

	for (const basePath of basePaths) {
		const candidate = path.join(basePath, normalized)
		if (await pathExists(candidate)) {
			candidates.add(candidate)
		}
	}

	return Array.from(candidates)
}


async function pathExists(filePath: string): Promise<boolean> {
	try {
		const stat = await fs.stat(filePath)
		return stat.isFile()
	} catch {
		return false
	}
}

function normalizeHookResult(result: unknown): NormalizedSeedHookResult | null {
	if (!result || typeof result !== 'object') {
		return null
	}

	const root = result as { env?: unknown }
	const env = normalizeEnvResult(root.env)

	if (!env) {
		return Object.keys(root).length > 0 ? {} : null
	}

	return { env }
}

function normalizeEnvResult(input: unknown): NormalizedSeedHookResult['env'] | null {
	if (!input || typeof input !== 'object') {
		return null
	}

	const envInput = input as { description?: unknown; variables?: unknown }
	const description = typeof envInput.description === 'string' ? envInput.description : undefined
	const variablesInput = envInput.variables

	if (!variablesInput || typeof variablesInput !== 'object') {
		return {
			description,
			variables: {}
		}
	}

	const variables: Record<string, NormalizedSeedHookVariable> = {}

	for (const [key, value] of Object.entries(variablesInput)) {
		if (!value && value !== '') {
			continue
		}

		if (typeof value === 'string') {
			variables[key] = { value }
			continue
		}

		if (typeof value === 'object') {
			const variable = value as Record<string, unknown>
			const rawValue = variable.value

			if (typeof rawValue !== 'string') {
				continue
			}

			variables[key] = {
				description: typeof variable.description === 'string' ? variable.description : undefined,
				overwrite: typeof variable.overwrite === 'boolean' ? variable.overwrite : undefined,
				value: rawValue
			}
		}
	}

	return {
		description,
		variables
	}
}
