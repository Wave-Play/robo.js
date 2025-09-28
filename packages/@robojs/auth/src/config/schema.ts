import { z } from 'zod'
import type { AuthMailer, MailParty, AuthEmailEvent, EmailBuilder, TemplateConfig } from '../emails/types.js'

const functionSchema = z.function().args(z.any()).returns(z.any())

const mailPartySchema = z.union([
	z.string(),
	z
		.object({
			name: z.string().optional(),
			address: z.string()
		})
		.strict()
])

const partialCookieSchema = z
	.object({
		name: z.string().optional(),
		options: z.any().optional()
	})
	.strict()

const cookiesSchema = z
	.object({
		sessionToken: partialCookieSchema.optional(),
		callbackUrl: partialCookieSchema.optional(),
		csrfToken: partialCookieSchema.optional(),
		pkceCodeVerifier: partialCookieSchema.optional(),
		state: partialCookieSchema.optional(),
		nonce: partialCookieSchema.optional(),
		webauthnChallenge: partialCookieSchema.optional()
	})
	.partial()
	.optional()

const sessionSchema = z
	.object({
		strategy: z.enum(['jwt', 'database']).optional(),
		maxAge: z.number().int().positive().optional(),
		updateAge: z.number().int().nonnegative().optional()
	})
	.optional()

const pagesSchema = z
	.object({
		signIn: z.string().optional(),
		signOut: z.string().optional(),
		error: z.string().optional(),
		verifyRequest: z.string().optional(),
		newUser: z.string().optional()
	})
	.partial()
	.optional()

const callbacksSchema = z
	.object({
		signIn: functionSchema.optional(),
		redirect: functionSchema.optional(),
		session: functionSchema.optional(),
		jwt: functionSchema.optional()
	})
	.partial()
	.optional()

const eventsSchema = z
	.object({
		createUser: functionSchema.optional(),
		updateUser: functionSchema.optional(),
		linkAccount: functionSchema.optional(),
		session: functionSchema.optional(),
		signIn: functionSchema.optional(),
		signOut: functionSchema.optional()
	})
	.partial()
	.optional()

const emailSchema = z
	.object({
		from: z.string().optional(),
		template: z.union([z.string(), functionSchema]).optional(),
		subject: z.union([z.string(), functionSchema]).optional(),
		text: z.union([z.string(), functionSchema]).optional(),
		deliver: functionSchema.optional(),
		sendVerificationRequest: functionSchema.optional(),
		expiresInMinutes: z.number().int().positive().optional()
	})
	.partial()
	.optional()

const emailsSchema = z
	.object({
		from: mailPartySchema.optional(),
		mailer: z.unknown().optional(),
		templates: z.record(z.any()).optional(),
		triggers: z.record(z.any()).optional()
	})
	.partial()
	.optional()

/**
 * Zod schema enforcing the structure of `@robojs/auth` plugin configuration.
 *
 * @example
 * ```ts
 * const config = authPluginOptionsSchema.parse({ basePath: '/api/auth' })
 * ```
 */
export const authPluginOptionsSchema = z
	.object({
		adapter: z.unknown().optional(),
		allowDangerousEmailAccountLinking: z.boolean().optional(),
		basePath: z.string().optional(),
		callbacks: callbacksSchema,
		cookies: cookiesSchema,
		debug: z.boolean().optional(),
		events: eventsSchema,
		email: emailSchema,
		emails: emailsSchema,
		pages: pagesSchema,
		providers: z.array(z.any()).optional(),
		redirectProxyUrl: z.string().url().optional(),
		secret: z.string().min(1).optional(),
		session: sessionSchema,
		url: z.string().url().optional()
	})
	.strict()

/** Strongly-typed `emails` configuration used to wire custom mailers and templates. */
export interface EmailsOptions {
	from?: MailParty
	mailer?: AuthMailer | (() => Promise<AuthMailer> | AuthMailer) | { module: string; export?: string }
	templates?: Partial<Record<AuthEmailEvent, TemplateConfig>>
	triggers?: Partial<Record<AuthEmailEvent, EmailBuilder | EmailBuilder[]>>
}

/** Convenience type mirroring the schema with improved autocomplete for the `emails` block. */
export type AuthPluginOptions = Omit<z.infer<typeof authPluginOptionsSchema>, 'emails'> & {
	emails?: EmailsOptions
}
