import type { Adapter } from '@auth/core/adapters'
import type { AuthConfig } from '@auth/core'
import type { CookiesOptions } from '@auth/core/types'
import type { Provider } from '@auth/core/providers'
import { authPluginOptionsSchema, type AuthPluginOptions } from './schema.js'
import { applyCookieOverrides, buildDefaultCookies } from '../utils/cookies.js'

const DEFAULT_SESSION_MAX_AGE = 60 * 60 * 24 * 30 // 30 days
const DEFAULT_SESSION_UPDATE_AGE = 60 * 60 * 24 // 24 hours

export const DEFAULT_BASE_PATH = '/api/auth'

export interface NormalizedAuthPluginOptions {
	adapter?: Adapter
	allowDangerousEmailAccountLinking: boolean
	basePath: string
	callbacks?: AuthConfig['callbacks']
	cookies: CookiesOptions
	debug?: boolean
	events?: AuthConfig['events']
	email?: AuthPluginOptions['email']
	pages?: AuthPluginOptions['pages']
	providers: Provider[]
	redirectProxyUrl?: string
	secret?: string
	session: NonNullable<AuthConfig['session']>
	url?: string
}

/**
 * Parses plugin configuration, applies defaults, and returns an Auth.js ready option set.
 *
 * @example
 * ```ts
 * import { normalizeAuthOptions } from '@robojs/auth'
 *
 * const resolved = normalizeAuthOptions({ basePath: '/api/auth' })
 * console.log(resolved.basePath) // "/api/auth"
 * ```
 */
export function normalizeAuthOptions(options: unknown): NormalizedAuthPluginOptions {
	const parsed = authPluginOptionsSchema.parse(options ?? {}) as AuthPluginOptions
	const cookies = applyCookieOverrides(buildDefaultCookies(), parsed.cookies)
	const sessionStrategy = parsed.session?.strategy ?? (parsed.adapter ? 'database' : 'jwt')

	return {
		adapter: parsed.adapter as Adapter | undefined,
		allowDangerousEmailAccountLinking: parsed.allowDangerousEmailAccountLinking ?? false,
		basePath: parsed.basePath ?? DEFAULT_BASE_PATH,
		callbacks: parsed.callbacks as AuthConfig['callbacks'],
		cookies,
		debug: parsed.debug,
		events: parsed.events as AuthConfig['events'],
		email: parsed.email,
		pages: parsed.pages,
		providers: (parsed.providers ?? []) as Provider[],
		redirectProxyUrl: parsed.redirectProxyUrl,
		secret: parsed.secret,
		session: {
			strategy: sessionStrategy,
			maxAge: parsed.session?.maxAge ?? DEFAULT_SESSION_MAX_AGE,
			updateAge: parsed.session?.updateAge ?? DEFAULT_SESSION_UPDATE_AGE
		},
		url: parsed.url
	}
}
