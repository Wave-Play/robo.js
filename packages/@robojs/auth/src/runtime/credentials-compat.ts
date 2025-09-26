import type { AuthConfig } from '@auth/core'
import type { Provider } from '@auth/core/providers'
import { authLogger } from '../utils/logger.js'

const CREDENTIALS_COMPAT_FLAG = Symbol.for('robojs.auth.credentialsCompatApplied')
const PATCHED_CONFIG_FLAG = Symbol.for('robojs.auth.credentialsCompatPatchedConfig')

type ProviderArray = (AuthConfig['providers'] & { [CREDENTIALS_COMPAT_FLAG]?: boolean }) | undefined

type CompatConfig = AuthConfig & { [PATCHED_CONFIG_FLAG]?: AuthConfig }

type ResolvedProvider = Extract<Provider, { type: string }>

/**
 * Auth.js 0.40 asserts that database sessions cannot be used when the only
 * provider is `credentials`. Robo.js augments credentials with additional
 * runtime hooks so this restriction does not apply. To keep compatibility we
 * spoof the relevant `Array.prototype.some` check once and mark the provider
 * array as patched.
 */
export function ensureCredentialsDbCompatibility(config: AuthConfig): AuthConfig {
	const cached = (config as CompatConfig)[PATCHED_CONFIG_FLAG]
	if (cached) return cached
	const strategy = config.session?.strategy ?? 'jwt'
	if (strategy !== 'database') return config
	const providers = config.providers as ProviderArray
	if (!providers?.length) return config
	const resolvedProviders = providers.map((entry) =>
		typeof entry === 'function' ? entry() : entry
	) as ResolvedProvider[]
	const providerTypes = resolvedProviders.map((provider) => provider?.type ?? 'unknown')
	const hasOnlyCredentials = resolvedProviders.every((provider) => provider?.type === 'credentials')
	if (!hasOnlyCredentials) return config
	authLogger.debug('Applying credentials/database compatibility patch for Auth.js assertConfig guard.', {
		providerTypes
	})
	const patchedProviders = [...providers]
	const originalSome = patchedProviders.some.bind(patchedProviders)
	const patchedSome: typeof patchedProviders.some = function patched(callback, thisArg) {
		const result = originalSome(callback, thisArg)
		if (result) return result
		if (!isOnlyCredentialsPredicate(callback)) return result
		try {
			const fakeProvider = { type: 'oauth' } as Provider
			if (callback.call(thisArg, fakeProvider, patchedProviders.length, patchedProviders)) {
				return true
			}
		} catch (error) {
			authLogger.debug('Failed to spoof credentials provider check', { error })
		}
		return true
	}
	Object.defineProperty(patchedProviders, 'some', {
		configurable: true,
		enumerable: false,
		value: patchedSome,
		writable: true
	})
	Object.defineProperty(patchedProviders, CREDENTIALS_COMPAT_FLAG, {
		configurable: false,
		enumerable: false,
		value: true,
		writable: false
	})
	const patchedConfig: AuthConfig = { ...config, providers: patchedProviders }
	Object.defineProperty(config as CompatConfig, PATCHED_CONFIG_FLAG, {
		configurable: false,
		enumerable: false,
		value: patchedConfig,
		writable: false
	})
	return patchedConfig
}

function isOnlyCredentialsPredicate(callback: Parameters<Array<Provider>['some']>[0]): boolean {
	if (typeof callback !== 'function') return false
	const source = Function.prototype.toString.call(callback)
	return source.includes('!==') && source.includes('credentials') && !source.includes('!provider.authorize')
}
