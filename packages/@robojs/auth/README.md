<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/auth

Modern authentication for Robo.js projects powered by [Auth.js](https://authjs.dev). This plugin drops the familiar `/api/auth/*` surface into your bot or activity, wires up OAuth and email/password flows, and exposes helper APIs for both server runtimes and client-facing experiences.

<div align="center">
	[![GitHub
	license](https://img.shields.io/github/license/Wave-Play/robo)](https://github.com/Wave-Play/robo/blob/main/LICENSE)
	[![npm](https://img.shields.io/npm/v/@robojs/auth)](https://www.npmjs.com/package/@robojs/auth) [![install
	size](https://packagephobia.com/badge?p=@robojs/auth@latest)](https://packagephobia.com/result?p=@robojs/auth@latest)
	[![Discord](https://img.shields.io/discord/1087134933908193330?color=7289da)](https://robojs.dev/discord) [![All
	Contributors](https://img.shields.io/github/all-contributors/Wave-Play/robo.js?color=cf7cfc)](https://github.com/Wave-Play/robo.js/blob/main/CONTRIBUTING.md#contributors)
</div>

➞ [📚 **Documentation:** Getting started](https://robojs.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://robojs.dev/discord)

## Installation 💡

Install and register the plugin:

```bash
npx robo add @robojs/auth
```

```ts
// config/plugins/robojs/auth.ts
import { discord, google } from '@robojs/auth/providers'
import { EmailPassword, createFlashcoreAdapter } from '@robojs/auth'
import type { AuthPluginOptions } from '@robojs/auth'

export default <AuthPluginOptions>{
  secret: process.env.AUTH_SECRET,
  adapter: createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! }),
  providers: [
    google({ clientId: process.env.GOOGLE_ID!, clientSecret: process.env.GOOGLE_SECRET! }),
    discord({ clientId: process.env.DISCORD_ID!, clientSecret: process.env.DISCORD_SECRET! }),
    EmailPassword()
  ]
}
```

Boot Robo.js and point your UI at `/api/auth` (customise via `basePath`). Robo will index the plugin, scaffold the REST routes, enable the built-in email/password flow, and keep Auth.js callbacks/event hooks in sync with your configuration.

Prefer Prisma over Flashcore? Swap the adapter and keep the rest of your config untouched by exporting from the same `config/plugins/robojs/auth.ts` entry point:

```ts
// config/plugins/robojs/auth.ts
import { PrismaClient } from '@prisma/client'
import { EmailPassword, createPrismaAdapter } from '@robojs/auth'
import type { AuthPluginOptions } from '@robojs/auth'

const prisma = new PrismaClient()

export default <AuthPluginOptions>{
	secret: process.env.AUTH_SECRET,
	adapter: createPrismaAdapter({
		client: prisma,
		secret: process.env.AUTH_SECRET!
	}),
	providers: [EmailPassword()]
}
```

> **Heads up:** Install `@auth/prisma-adapter` (and `@prisma/client`) in your project before wiring this adapter.

The Prisma adapter stays compatible with Auth.js' recommended schema while layering in password helpers, reset tokens, and pagination utilities. See the cheatsheet below for the schema blocks to add alongside your existing Auth.js models.

## What You Get

- **Drop-in Auth.js REST endpoints** mirroring `/api/auth/*` (providers, sign-in/out, callback, session, csrf).
- **Storage adapters** with zero configuration Flashcore defaults and an optional Prisma variant that layers password helpers onto Auth.js' schema.
- **Email + password support** on by default with hashed storage, password reset tokens, and opt-in authorisation hooks.
- **Templated email flows** that plug into Auth.js providers (Resend, Postmark, SendGrid, Nodemailer, …) or your own deliver function, including fully rendered HTML/text templates.
- **Typed client helpers** for UI surfaces to sign in, sign out, fetch providers, sessions, and CSRF tokens.
- **Server utilities** for grabbing sessions/tokens, configuring runtime state, and bridging Robo requests into Auth.js handlers.

## Configuration Overview

`AuthPluginOptions` extends the Auth.js config you already know:

| Option | Default | Notes |
| ------ | ------- | ----- |
| `basePath` | `/api/auth` | Prefix for generated routes. |
| `secret` | _required in prod_ | Used for JWT + token hashing. Reads `AUTH_SECRET`/`NEXTAUTH_SECRET`. |
| `url` | env (`AUTH_URL`/`NEXTAUTH_URL`) or `http://localhost:3000` | Canonical URL for Auth.js callbacks. |
| `redirectProxyUrl` | `AUTH_REDIRECT_PROXY_URL` | Useful for preview deployments. |
| `providers` | `[]` | Array of Auth.js providers. Helpers live under `@robojs/auth/providers`. |
| `adapter` | Flashcore | Swap for any Auth.js adapter when you outgrow the default storage. |
| `session.strategy` | `jwt` (or `database` when adapter present) | Supports `maxAge` & `updateAge`. |
| `cookies`, `callbacks`, `events`, `pages` | Auth.js defaults | Use the same shapes as upstream Auth.js. |
| `email` / `emails` | `{}` | Override templates, configure mailers, or bind to third-party transports. |
| `upstream` | _unset_ | Forward all Auth.js routes to another Robo instance with `{ baseUrl, basePath?, headers?, cookieName?, secret?, sessionStrategy?, fetch? }`. |

Need validation? Use the exported `authPluginOptionsSchema` or call `normalizeAuthOptions(options)` to apply defaults before passing into other tooling.

### Built-in Email + Password Storage

When no custom adapter is supplied, Robo stores hashed passwords, reset tokens, and user metadata in Flashcore. The bundled email/password provider (documented later) is turned on by default so your UI can immediately present email + password fields without extra wiring. Swap the adapter whenever you introduce your own persistence layer.

### Proxying Another Robo Project

Need the same Auth.js instance across multiple Robo apps? Set `upstream.baseUrl` to the canonical deployment and the plugin will proxy every `/api/auth/*` route (plus `getServerSession`/`getToken`) to that remote service.

```ts
// config/plugins/robojs/auth.ts
import type { AuthPluginOptions } from '@robojs/auth'

export default <AuthPluginOptions>{
	basePath: '/api/auth',
	upstream: {
		baseUrl: process.env.AUTH_UPSTREAM_URL!,
		headers: { 'x-api-key': process.env.AUTH_PROXY_KEY! }
	}
}
```

Provide `upstream.secret` if you want `getToken()` to decode JWT payloads locally; otherwise call it with `{ raw: true }` or use `getServerSession()` which always consults the upstream service.

## Flashcore Adapter Cheatsheet

Out of the box the plugin persists everything to Flashcore namespaces. Swap to your own adapter by exporting it from `AuthPluginOptions`. When you enable (or customise) the credentials flow, make sure your adapter satisfies the extended `PasswordAdapter` contract—use `assertPasswordAdapter(adapter)` in development to catch missing methods early.

### Listing Users

```ts
import { listUsers, listUserIds } from '@robojs/auth'

const page = await listUsers()             // { users, page, pageCount, total }
const ids = await listUserIds(2)           // { ids, page, pageCount, total }
```

## Prisma Adapter Cheatsheet

Already using Auth.js with Prisma? `createPrismaAdapter` layers Robo's password helpers and reset-token flow on top of the official `@auth/prisma-adapter` so you can reuse your existing tables (and migrations) with almost no changes.

### Schema Additions

Add a single model alongside the standard Auth.js schema. It extends the user relation with argon2id hashes while keeping pagination fast:

```prisma
model Password {
	id        String   @id @default(cuid())
	userId    String   @unique
	email     String   @unique
	hash      String
	createdAt DateTime @default(now())
	updatedAt DateTime @updatedAt

	user User @relation(fields: [userId], references: [id], onDelete: Cascade)

	@@index([email])
}
```

PostgreSQL users can swap `String` for `@db.Citext` on `email` to keep lookups case-insensitive; other drivers can rely on the adapter's lower-cased mirror. Password reset links continue to use Auth.js' built-in verification token table, so no additional schema is required. Run `npx prisma migrate dev --name add-auth-passwords` (or your preferred command) after updating the schema.

### Adapter Options

`createPrismaAdapter` accepts the following options (after installing `@auth/prisma-adapter`):

- `client` – your `PrismaClient` instance.
- `secret` – standard Auth.js secret for session/token helpers (typically `AUTH_SECRET`).
- `hashParameters` – optional argon2id tuning; pass overrides to rehash on verify when params change.
- `models.password` – override the password model name if you already migrated with different identifiers.

The adapter returns the same extended `PasswordAdapter` contract as the Flashcore version, so the built-in EmailPassword provider works without changes.

### Listing Users

```ts
import { listPrismaUsers, listPrismaUserIds } from '@robojs/auth'

const { users } = await listPrismaUsers(prisma)
const { ids } = await listPrismaUserIds(prisma, { page: 1, pageSize: 100 })
```

Both helpers accept optional `{ page, pageSize, orderBy, where }` parameters and share the same return shape as the Flashcore utilities, making it easy to drop into dashboards or admin tooling.

## Client API

All client helpers are exported via `@robojs/auth/client` (and re-exported from the package root). Each function accepts optional overrides for `basePath`, `baseUrl`, headers, or a custom `fetch` implementation—ideal for activities or external UIs.

| Function | Description |
| -------- | ----------- |
| `signIn(providerId, body?, options?)` | POST to `/signin` (or a provider-specific route) to begin the Auth.js flow. Pass extra form fields via `body`. |
| `signOut(options?)` | POST to `/signout` and clear the active session cookie. |
| `getSession(options?)` | GET `/session` and return the current `Session` object (or `null`). |
| `getProviders(options?)` | GET `/providers` for a runtime list of configured Auth.js providers. |
| `getCsrfToken(options?)` | GET `/csrf` to retrieve the token required for form POSTs. |

```ts
import { signIn, getSession, getProviders } from '@robojs/auth/client'

await signIn('google')

const session = await getSession({ headers: { cookie: request.headers.get('cookie') ?? '' } })
const providers = await getProviders()
```

Set `baseUrl` when calling these helpers to speak to a different origin—ideal when a frontend Robo app proxies to a backend deployment that owns the Auth.js adapter.

## Server API

Server helpers live under `@robojs/auth/server` (also re-exported from the root package). They let you normalise config, bridge Robo requests into Auth.js, and interact with storage/state.

### Runtime + Routing

| Export | Description |
| ------ | ----------- |
| `createAuthRequestHandler(config)` | Wrap a prepared Auth.js config in a Robo-compatible handler. Perfect for custom HTTP routers or activities. |
| `configureAuthRuntime(config, options)` | Warm a singleton Auth.js handler with explicit base path, cookie name, and secret—required before calling `getServerSession` or `getToken`. |
| `configureAuthProxyRuntime(options)` | Point the helpers at a remote Auth.js deployment while keeping your local Robo routes. |
| `AUTH_ROUTES` | Reference list of the REST routes the plugin wires up. Great for routing tables or documentation generators. |
| `DEFAULT_BASE_PATH` | Literal `/api/auth`. Use when syncing config across services. |

### Session Helpers

| Export | Description |
| ------ | ----------- |
| `getServerSession(input?)` | Invoke the Auth.js session route with the headers you provide and return the parsed `Session` (or `null`). Works with `Request`, `Headers`, or plain header records. |
| `getToken(input?, options?)` | Extract the session token/JWT in the same way `authjs/jwt` does. Supports `{ raw: true }` to return the cookie value instead of decoding. |

### Configuration + Storage

| Export | Description |
| ------ | ----------- |
| `normalizeAuthOptions(options)` | Run your raw plugin config through the same defaults the CLI uses. Returns a `NormalizedAuthPluginOptions` object ready for Auth.js. |
| `authPluginOptionsSchema` | Zod schema backing the plugin configuration. Useful for validation in external tooling. |
| `createFlashcoreAdapter(options)` | Construct the built-in Flashcore adapter (requires `secret`). |
| `createPrismaAdapter(options)` | Wrap Auth.js' Prisma adapter with Robo's password helpers, reset token hashing, and pagination helpers. |
| `listUsers(page?)` / `listUserIds(page?)` | Paginate users or IDs stored through the Flashcore adapter. |
| `listPrismaUsers(options?)` / `listPrismaUserIds(options?)` | Paginate Prisma-backed users or IDs using the shared return shape. |
| `authLogger` | Namespaced logger instance (`auth`). |

### Types & Utilities

| Export | Purpose |
| ------ | ------- |
| `getRequestPayload(request)` | Parse (and cache) JSON/form bodies when writing custom route overrides or middleware. |
| `AuthPluginOptions` | TypeScript type mirroring the plugin config shape. |
| `AuthEmailEvent`, `AuthMailer`, `MailMessage`, `EmailContext`, `TemplateConfig` | Email-related types for advanced templating or mailer overrides. |
| `PasswordAdapter`, `PasswordRecord`, `assertPasswordAdapter` | Contracts for credential-enabled adapters. |
| `PrismaAdapterOptions`, `PrismaAdapterModelOptions`, `PrismaClientLike` | Types for wiring the Prisma adapter with custom model names or clients. |
| `Adapter`, `AdapterAccount`, `AdapterSession`, `AdapterUser`, `VerificationToken` | Re-exported Auth.js adapter types for convenience. |

## Email Delivery Options

You control how verification and transactional emails go out:

- **Custom mailer** – provide `emails.mailer` or `emails.triggers` entries that call straight into your favorite SDK (Resend, SES, SendGrid, etc.).
- **Auth.js mailer modules** – point `emails.mailer` to a module export `{ module: 'resend', export: 'Resend' }` so the plugin loads it for you at runtime.
- **React templates** – attach `emails.templates['password:reset-request'] = { react: (ctx) => <MyEmail ctx={ctx} /> }` and Robo will render it with `@react-email/components` + `react-dom/server` on demand.
- **Disable defaults** – set `emails.templates['user:created'] = false` (or any other event) to suppress that automatic email without affecting the rest.

```ts
export default {
  secret: process.env.AUTH_SECRET,
  emails: {
    mailer: { module: 'resend', export: 'Resend' },
    triggers: {
      'password:reset-request': (ctx) => ({
        to: ctx.user.email!,
        subject: 'Reset your password',
        html: `<p>Hi ${ctx.user.name ?? 'friend'}, reset your password <a href="${ctx.links?.resetPassword}">here</a>.</p>`
      })
    },
    templates: {
      'user:created': {
        subject: 'Welcome aboard!',
        text: ({ user }) => `Hi ${user.name ?? 'there'}, thanks for joining Robo.`
      }
    }
  }
}
```

If you provide both `emails.mailer` and a `deliver` function inside a trigger, the trigger’s `deliver` takes precedence for that event.

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
| `get<T>()` | Returns the cached record. Provide a type argument for convenience. |
| `assign(partial)` | Shallow-merges new fields into the cached payload (handy for normalising values). |
| `replace(data)` | Overwrites the cached payload entirely. |
| `source` | Reports where the data came from: `'json'`, `'form'`, or `'empty'`. |

All email/password routes use this helper under the hood, so your overrides, the default handlers, and Auth.js callbacks all observe the same payload.

## Email & Password Provider Extensions

`EmailPassword(options)` is enabled by default and powers the classic email **and** password form flows (sign-in, sign-up, reset). It builds on Auth.js' Credentials provider but adds Robo niceties: shared payload parsing, CSRF checks, database session cookies, auto sign-in after signup, and configurable email templates.

### Custom `authorize`

```ts
EmailPassword({
  adapter,
  authorize: async (credentials, ctx) => {
    const payload = await getRequestPayload(ctx.request)
    const record = payload.get<{ email?: string; cliCode?: string }>()

    if (!isCliCodeValid(record.cliCode)) {
      return null
    }

    payload.assign({ cliCode: record.cliCode?.trim() })

    const user = await ctx.defaultAuthorize()
    return user ? { ...user, cliCode: record.cliCode } : null
  }
})
```

`authorize` receives an `EmailPasswordAuthorizeContext`:

| Property | Description |
| --- | --- |
| `adapter` | The active `PasswordAdapter`. |
| `request` | The `RoboRequest` so you can inspect headers, IPs, or cookies. |
| `defaultAuthorize()` | Runs the bundled credentials logic (`findUserIdByEmail` → `verifyUserPassword`). |

Return `null` to reject the login or an `AdapterUser` (optionally augmented with extra fields) to continue. Any additional fields you add can flow through JWT/session callbacks.

### Route overrides

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
    },
    passwordResetConfirm: async ({ request, defaultHandler }) => {
      await enforcePasswordRules(await request.json())
      return defaultHandler()
    }
  }
})

function auditResetAttempt(payload: Record<string, unknown>) {
  console.log('password reset requested', payload.email)
}

async function enforcePasswordRules(body: Record<string, unknown>) {
  if (typeof body.newPassword !== 'string' || body.newPassword.length < 12) {
    throw new Error('Password must be at least 12 characters long')
  }
}
```

Each override receives an `EmailPasswordRouteContext` with:

| Property | Description |
| --- | --- |
| `payload` | Shared `RequestPayloadHandle` (see above). |
| `defaultHandler()` | Invokes Robo's stock behaviour (CSRF checks, hashing, session cookies, email dispatch). |
| `adapter`, `authConfig`, `cookies`, `events`, `basePath`, `baseUrl`, `secret`, `sessionStrategy` | Context from the running plugin instance. |
| `request` | The raw `RoboRequest`. |

Available hooks:

| Hook | Triggered on | Typical use |
| --- | --- | --- |
| `signup` | `POST /signup` | Invite-code gating, analytics, custom redirects. |
| `passwordResetRequest` | `POST /password/reset/request` | Captcha, throttling, SMS notifications. |
| `passwordResetConfirm` | `POST /password/reset/confirm` / helper GET | Extra password policy, audit logging. |

Handlers can return their own `Response` to short-circuit the plugin or call `defaultHandler()` to inherit the stock flow. Because the payload is shared, any `assign()` calls you make persist through the rest of the lifecycle, including Auth.js callbacks and events.

## Got questions? 🤔

If you have any questions or need help with this plugin, join our Discord — we’re friendly and happy to help!

➞ [🚀 ](https://robojs.dev/discord)**[Community: Join our Discord server](https://robojs.dev/discord)**
