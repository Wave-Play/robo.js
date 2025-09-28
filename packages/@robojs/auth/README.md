# @robojs/auth

Authentication for Robo.js powered by [Auth.js](https://authjs.dev). This plugin wires up OAuth (Google, Discord, Apple), passwordless email, optional credentials, sessions, and REST endpoints that mirror NextAuth (`/api/auth/*`). It ships with a Flashcore-backed adapter so you get persistent storage with zero setup, and you can swap to any Auth.js adapter when you need to scale.

## Features

- 🔐 OAuth providers (Google, Discord, Apple) plus email magic links.
- 🔑 Optional credential helper with hashed passwords, reset tokens, and rate-limited flows.
- 🧩 Email/password provider hooks for custom `authorize` logic and pluggable signup/reset handlers.
- 📦 Shared request-payload helpers so route overrides and Auth.js defaults read the same parsed body.
- 🍪 Secure cookies, CSRF protection, JWT or database sessions (Flashcore by default).
- 🛣 Matches Auth.js REST routes: `/providers`, `/signin`, `/session`, `/csrf`, `/callback/:provider`, and more.
- 🧱 Callbacks & events (`signIn`, `jwt`, `session`, `createUser`, ...).
- 📨 Default magic-link template with automatic piggybacking onto third-party email transports.
- 🔌 Client/server helpers (`signIn`, `signOut`, `getSession`, `getServerSession`, `getToken`).

## Getting Started

Install the plugin in your Robo.js project:

```bash
npx robo add @robojs/auth
```

Then add the plugin to your `config/plugins` (or inline in `config/robo.ts`):

```ts
// config/plugins/@robojs/auth.ts
import { google, discord, email } from '@robojs/auth/providers'
import Resend from '@robojs/auth/providers/resend'
import type { AuthPluginOptions } from '@robojs/auth'

export default <AuthPluginOptions>{
	secret: process.env.AUTH_SECRET,
	providers: [
		google({ clientId: process.env.AUTH_GOOGLE_ID!, clientSecret: process.env.AUTH_GOOGLE_SECRET! }),
		discord({ clientId: process.env.AUTH_DISCORD_ID!, clientSecret: process.env.AUTH_DISCORD_SECRET! }),
		// Robo's email helper handles templating + lifecycle.
	email({ from: 'login@example.com' }),
		// Any Auth.js email provider can piggyback the Robo template.
		Resend({ apiKey: process.env.RESEND_API_KEY!, from: 'login@example.com' })
	]
}
```

Robo.js will auto-register the REST endpoints when the bot boots. Point your UI or activity client at `/api/auth` (or your custom `basePath`). Email will only send when you provide either a `deliver` handler or add a supported Auth.js email provider (Resend, SendGrid, Postmark, Nodemailer). When a third-party email provider is present, Robo automatically routes its magic-link template through that transport.

## Configuration

| Option | Default | Description |
| --- | --- | --- |
| `basePath` | `/api/auth` | Root for all REST endpoints. |
| `secret` | _generated in dev_ | Secret used for JWT encryption and token hashing. Required in production. |
| `url` | `AUTH_URL` env or `http://localhost:3000` | Canonical application URL used by providers. |
| `redirectProxyUrl` | `AUTH_REDIRECT_PROXY_URL` env | Proxy domain for preview deployments. |
| `session.strategy` | `jwt` (or `database` when adapter present) | Session persistence mode. Supports `maxAge` and `updateAge`. |
| `adapter` | Flashcore adapter | Any Auth.js adapter instance. Provide to use your own database. |
| `providers` | `[]` | Array of Auth.js providers (see below). |
| `pages` | `{}` | Override default Auth.js page routes. |
| `callbacks` / `events` | `{}` | Hook into Auth.js lifecycle. |
| `cookies` | Secure defaults | Modify cookie names/flags (chunking handled automatically). |
| `email` | `{}` | Email provider overrides (template, sender, third-party piggyback). |

All options accept the same shapes as Auth.js. The Zod schema is exported as `authPluginOptionsSchema` if you want extra validation.

## Providers

```ts
import { google, discord, apple, email } from '@robojs/auth/providers'
```

Each helper re-exports the corresponding Auth.js provider, so the options are identical to Auth.js documentation. You can still pass custom providers by pushing them into `providers`.

> 💡 Every provider that ships with Auth.js is available via `@robojs/auth/providers/*` (e.g. `import Resend from '@robojs/auth/providers/resend'`). Types are re-exported as well, mirroring the upstream modules.

### Email Delivery

The Robo email helper focuses on templating, logging, and lifecycle wiring. You can either:

- Provide a custom `deliver` function (Resend SDK, AWS SES client, etc.).
- Add any Auth.js email provider (`resend`, `sendgrid`, `postmark`, or `nodemailer`). When these providers are present alongside Robo's email helper, Robo automatically piggybacks your magic-link template onto the provider's delivery channel—no additional wiring required.

If you already have a bespoke Auth.js handler, you can continue passing `sendVerificationRequest` and Robo will defer entirely to it. When neither `deliver` nor a compatible provider is present the plugin logs a warning and prints the magic link instead of attempting to send email.

## Flashcore Adapter

If you do not supply an adapter, the plugin boots with a Flashcore-backed adapter that persists users, accounts, sessions, verification tokens, and credential hashes. Keys live under:

- `auth:users:<id>`
- `auth:accounts:<provider>:<id>`
- `auth:sessions:<token>`
- `auth:verification:<hash>`
- `auth_password:<userId>`
- `auth_passwordUserByEmail:<email>`

You can swap to your own adapter by returning any Auth.js adapter instance from `adapter`. If you enable the credentials helper, your adapter must also implement the password helpers exposed in `PasswordAdapter`:

```ts
import type { PasswordAdapter, PasswordRecord, PasswordResetToken } from '@robojs/auth'

const adapter: PasswordAdapter = {
  async createUserPassword({ userId, email, password }): Promise<PasswordRecord> {
    /* hash and persist the password for this user */
    return {
      id: crypto.randomUUID(),
      userId,
      email,
      hash: '<argon2id-hash>',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
  },
  async verifyUserPassword({ userId, password }) {
    /* look up and verify the password */
    return true
  },
  async findUserIdByEmail(email) {
    /* return the user id or null */
    return null
  },
  async deleteUserPassword(userId) {
    /* remove hash for this user */
  },
  async resetUserPassword({ userId, password }) {
    /* replace the existing hash */
    return null
  },
  async createPasswordResetToken(userId, ttlMinutes): Promise<PasswordResetToken> {
    /* persist a reset token */
    return { token: 'reset-token', userId, expires: new Date(Date.now() + ttlMinutes! * 60_000) }
  },
  async usePasswordResetToken(token) {
    /* consume and validate a reset token */
    return null
  },
  // ...plus the normal Auth.js adapter methods
}
```

Use `assertPasswordAdapter(adapter)` to fail fast when a supplied adapter is missing password capabilities.

## Credentials Helper (opt-in)

The plugin provides helpers to back an Auth.js Credentials provider with Flashcore:

```ts
import { passwordCredentialsProvider } from '@robojs/auth'

providers: [passwordCredentialsProvider({ adapter, allowRegistration: true })]
```

Use the adapter's password helpers to build onboarding, password reset, and enforcement flows. Everything is disabled by default—only add the provider if you explicitly want credential logins.

## Request Payload Utilities

When you post JSON (for example, from a custom web UI) instead of relying on the built-in HTML forms, the `getRequestPayload(request)` helper lets you read and reuse the parsed body without exhausting the stream:

```ts
import { EmailPassword, getRequestPayload } from '@robojs/auth'

EmailPassword({
  adapter,
  authorize: async (credentials, ctx) => {
    const payload = await getRequestPayload(ctx.request)
    const body = payload.get<{ inviteCode?: string }>()

    if (!body.inviteCode) return null
    await verifyInvite(body.inviteCode)
    payload.assign({ inviteCode: body.inviteCode.trim().toUpperCase() })

    const user = await ctx.defaultAuthorize()
    return user ? { ...user, inviteCode: body.inviteCode } : null
  },
  routes: {
    signup: async ({ payload, defaultHandler }) => {
      const body = payload.get<{ inviteCode?: string }>()
      await verifyInvite(body.inviteCode)
      payload.assign({ inviteCode: body.inviteCode?.trim()?.toUpperCase() })
      return defaultHandler()
    }
  }
})

callbacks: {
  async session({ session, token }) {
    session.inviteCode = token.inviteCode
    return session
  }
},
events: {
  async signIn(message) {
    console.log('signIn', message.user?.id, message.session?.inviteCode)
  }
}

async function verifyInvite(code?: string) {
  if (!code) throw new Error('Missing invite')
  // custom validation
}
```

`getRequestPayload` returns a `RequestPayloadHandle` with:

| Method | Description |
| --- | --- |
| `get<T>()` | Returns the cached record. You can provide a type argument for convenience. |
| `assign(partial)` | Shallow-merges new fields into the cached payload (handy for normalizing values). |
| `replace(data)` | Overwrites the cached payload entirely. |
| `source` | Reports where the data came from: `'json'`, `'form'`, or `'empty'`. |

All email/password routes use this helper under the hood, so your overrides, the default handlers, and Auth.js callbacks all observe the same payload.

## Email & Password Provider Extensions

`EmailPassword(options)` now exposes the same override surface you may know from Auth.js' Credentials provider, but with Robo-specific helpers baked in.

### Custom `authorize`

```ts
EmailPassword({
  adapter,
  authorize: async (credentials, ctx) => {
    const payload = await getRequestPayload(ctx.request)
    const record = payload.get<{ email?: string; cliCode?: string }>()

    if (!isCliCodeValid(record.cliCode)) {
      return null // Abort login without touching the adapter
    }

    // Optionally persist normalized data for downstream handlers
    payload.assign({ cliCode: record.cliCode?.trim() })

    const user = await ctx.defaultAuthorize()
    return user ? { ...user, cliCode: record.cliCode } : null
  }
})
```

The `authorize` callback receives a `EmailPasswordAuthorizeContext`:

| Property | Description |
| --- | --- |
| `adapter` | The active `PasswordAdapter`. |
| `request` | The `RoboRequest` so you can inspect headers or IPs. |
| `defaultAuthorize()` | Runs the built-in credentials flow (`findUserIdByEmail` → `verifyUserPassword`). |

Return `null` to reject the login, or return an `AdapterUser` (optionally augmented with extra fields). Any extra data you attach can be forwarded through Auth.js callbacks, as shown in the sample above.

### Route overrides

You can replace or wrap the built-in signup and password-reset routes without forking the plugin:

```ts
EmailPassword({
  adapter,
  routes: {
    signup: async ({ payload, defaultHandler }) => {
      const body = payload.get<{ inviteCode?: string }>()
      await verifyInvite(body.inviteCode)
      payload.assign({ inviteCode: body.inviteCode?.toUpperCase() })
      return defaultHandler()
    },
    passwordResetRequest: async ({ payload, defaultHandler }) => {
      auditResetAttempt(payload.get())
      return defaultHandler()
    }
  }
})
```

Each route handler receives an `EmailPasswordRouteContext` with:

| Property | Description |
| --- | --- |
| `payload` | The shared `RequestPayloadHandle` described above. |
| `defaultHandler()` | Invokes Robo's built-in behaviour (CSRF checks, token creation, auto sign-in, etc.). |
| `adapter`, `authConfig`, `cookies`, `events`, `basePath`, `baseUrl`, `secret`, `sessionStrategy` | Matching values from the running instance. |
| `request` | The raw `RoboRequest`. |

Available route hooks:

| Hook | Triggered on | Typical use |
| --- | --- | --- |
| `signup` | `POST /signup` | Custom validation, user provisioning, analytics, alternate redirects. |
| `passwordResetRequest` | `POST /password/reset/request` | Throttling, captcha checks, SMS/Slack notifications. |
| `passwordResetConfirm` | `POST /password/reset/confirm` (and assisting GET) | Extra password rules, audit logging, alternative success responses. |

Handlers can return their own `Response` to short-circuit the plugin’s behaviour, or call `defaultHandler()` to keep the stock flow provided by @robojs/auth (CSRF checks, password hashing, session cookies, emails, etc.). Because the shared payload is cached, any `assign()` calls you make before invoking `defaultHandler()` are visible to the built-in logic and to downstream Auth.js events.

## Client & Server Helpers

```ts
import { signIn, signOut, getSession, getProviders, getCsrfToken } from '@robojs/auth'
import { getServerSession, getToken } from '@robojs/auth'
```

These helpers wrap the registered endpoints so you can call them from Robo.js commands, web handlers, or activities without re-implementing the HTTP contract.

## Runtime Notes

- `Server.registerRoute` from `@robojs/server` is used to mount the REST handlers; ensure `@robojs/server` is also installed.
- Cookies automatically downgrade `Secure` when the configured `url` uses HTTP (development mode).
- If you rely on preview deployments, set `AUTH_REDIRECT_PROXY_URL` so OAuth callbacks work from ephemeral hosts.

## License

MIT © WavePlay
