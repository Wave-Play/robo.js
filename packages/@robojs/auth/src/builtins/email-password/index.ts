import CredentialsProvider from '@auth/core/providers/credentials'
import { authLogger } from '../../utils/logger.js'
import type {
	EmailPasswordAuthorizeContext,
	EmailPasswordProviderMetadata,
	EmailPasswordProviderOptions
} from './types.js'

type ProviderLike = ReturnType<typeof CredentialsProvider>

type ProviderWithMetadata = ProviderLike & { __roboEmailPassword?: EmailPasswordProviderMetadata }

function createProvider(options: EmailPasswordProviderOptions): ProviderLike {
	const { adapter, name = 'Email & Password', authorize, routes } = options

	const defaultAuthorize = async (credentials: Record<string, unknown> | undefined) => {
		authLogger.debug('Authorizing credentials login', {
			email: credentials?.email,
			password: credentials?.password ? '****' : undefined
		})
		const email = String(credentials?.email ?? '').toLowerCase()
		const password = String(credentials?.password ?? '')
		if (!email || !password) {
			authLogger.warn('Missing email or password in credentials')
			return null
		}

		const userId = await adapter.findUserIdByEmail(email)
		if (!userId) {
			authLogger.debug(`No user found for email ${email}`)
			return null
		}

		const isValid = await adapter.verifyUserPassword({ userId, password })
		if (!isValid) {
			authLogger.debug(`Invalid password attempt for ${email}`)
			return null
		}

		return adapter.getUser ? adapter.getUser(userId) : null
	}

	const provider = CredentialsProvider({
		name,
		credentials: {
			email: { label: 'Email', type: 'email' },
			password: { label: 'Password', type: 'password' }
		},
		authorize: async (credentials: Record<string, unknown> | undefined, request: Request | undefined) => {
			const ctx: EmailPasswordAuthorizeContext = {
				adapter,
				defaultAuthorize: () => defaultAuthorize(credentials),
				request
			}
			if (!authorize) {
				return ctx.defaultAuthorize()
			}
			return authorize(credentials, ctx)
		}
	}) as ProviderWithMetadata

	Object.defineProperty(provider, '__roboEmailPassword', {
		configurable: true,
		enumerable: false,
		writable: true,
		value: {
			routes
		} satisfies EmailPasswordProviderMetadata
	})

	return provider
}

export default function EmailPasswordProvider(options: EmailPasswordProviderOptions): ProviderLike {
	return createProvider(options)
}

export type {
	EmailPasswordAuthorize,
	EmailPasswordAuthorizeContext,
	EmailPasswordRouteContext,
	EmailPasswordRouteHandler,
	EmailPasswordRouteOverrides,
	PasswordRecord,
	PasswordResetToken
} from './types.js'
export type { RequestPayloadHandle } from '../../utils/request-payload.js'
