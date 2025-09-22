export { createFlashcoreAdapter } from './adapters/flashcore.js'
export type { Adapter, AdapterAccount, AdapterSession, AdapterUser, VerificationToken } from '@auth/core/adapters'
export { DEFAULT_BASE_PATH, normalizeAuthOptions } from './config/defaults.js'
export { authPluginOptionsSchema } from './config/schema.js'
export type { AuthPluginOptions } from './config/schema.js'
export {
	createResetToken,
	findUserIdByEmail,
	passwordCredentialsProvider,
	removePassword,
	resetPassword,
	storePassword,
	useResetToken,
	verifyPassword
} from './credentials/password.js'
export { createAuthRequestHandler } from './runtime/handler.js'
export { AUTH_ROUTES } from './runtime/route-map.js'
export {
	configureAuthRuntime,
	getServerSession,
	getToken
} from './runtime/server-helpers.js'
export { signIn, signOut, getSession, getProviders, getCsrfToken } from './runtime/client-helpers.js'
export { authLogger } from './utils/logger.js'
