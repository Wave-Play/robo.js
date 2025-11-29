import CredentialsProvider from '@auth/core/providers/credentials'
import { authLogger } from '../../utils/logger.js'
import { Argon2Hasher } from '../../utils/password-hash.js'
import type {
	EmailPasswordAuthorizeContext,
	EmailPasswordProviderMetadata,
	EmailPasswordProviderOptions
} from './types.js'

type ProviderLike = ReturnType<typeof CredentialsProvider>

type ProviderWithMetadata = ProviderLike & { __roboEmailPassword?: EmailPasswordProviderMetadata }

function createProvider(options: EmailPasswordProviderOptions): ProviderLike {
	const { adapter, name = 'Email & Password', authorize, routes, hasher = new Argon2Hasher() } = options

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

		const record = await adapter.getUserPassword(userId)
		if (!record) {
			authLogger.debug(`No password record found for ${email}`)
			return null
		}

		const isValid = await hasher.verify(password, record.hash)
		if (!isValid) {
			authLogger.debug(`Invalid password attempt for ${email}`)
			return null
		}

		if (hasher.needsRehash(record.hash)) {
			try {
				const newHash = await hasher.hash(password)
				await adapter.resetUserPassword({ userId, hash: newHash })
				authLogger.debug(`Rehashed password for ${email}`)
			} catch (error) {
				authLogger.warn(`Failed to rehash password for ${email}`, error)
			}
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
			routes,
			hasher
		} satisfies EmailPasswordProviderMetadata
	})

	return provider
}

export default function EmailPasswordProvider(options: EmailPasswordProviderOptions): ProviderLike {
	return createProvider(options)
}
