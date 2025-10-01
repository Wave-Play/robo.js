export type {
	Session,
	DefaultSession,
	User,
	Account,
	Profile,
	Theme,
	TokenSet,
	CookiesOptions,
	CookieOption,
	PublicProvider,
	Awaitable,
	Awaited
} from '@auth/core/types'
export type { JWT } from '@auth/core/jwt'
export type { AuthConfig } from '@auth/core'
export type {
	Adapter,
	AdapterAccount,
	AdapterSession,
	AdapterUser,
	VerificationToken
} from '@auth/core/adapters'
export type {
	AuthEmailEvent,
	AuthMailer,
	MailParty,
	MailAttachment,
	MailMessage,
	EmailContext,
	TemplateConfig,
	TemplateOverride,
	EmailBuilder,
	MaybePromise,
	TemplateValue,
	ReactEmailRenderable,
	ReactTemplateRenderer,
	ReactTemplateResult
} from './emails/types.js'
export type { EmailsOptions, AuthPluginOptions } from './config/schema.js'
export type { RequestPayloadHandle } from './utils/request-payload.js'
export type { ConfigureAuthRuntimeOptions, ConfigureAuthProxyRuntimeOptions } from './runtime/server-helpers.js'
export type {
	PasswordAdapter,
	PasswordRecord,
	EmailPasswordAuthorize,
	EmailPasswordAuthorizeContext,
	EmailPasswordProviderOptions,
	EmailPasswordRouteContext,
	EmailPasswordRouteHandler,
	EmailPasswordRouteOverrides,
	EmailPasswordProviderMetadata
} from './builtins/email-password/types.js'
export type {
	PrismaAdapterOptions,
	PrismaAdapterModelOptions,
	PrismaClientLike
} from './adapters/prisma.js'
