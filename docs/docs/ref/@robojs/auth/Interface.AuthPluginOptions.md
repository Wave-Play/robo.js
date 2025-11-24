# Interface: AuthPluginOptions

Configuration options for the `@robojs/auth` plugin.

Refer to the plugin README for a comprehensive table of options and
defaults. The CLI applies sane defaults; most fields are optional.

Notable defaults:
- `basePath`: "/api/auth"
- `session.maxAge`: 2592000 (30 days)
- `session.updateAge`: 86400 (24 hours)
- `session.strategy`: 'database' when an adapter is present, otherwise 'jwt'

Security notes:
- `allowDangerousEmailAccountLinking` should remain `false` unless all OAuth
  providers are fully trusted.

## Properties

### adapter?

```ts
optional adapter: unknown;
```

Storage adapter for users, sessions, and accounts.

#### Example

```ts
createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
```

***

### allowDangerousEmailAccountLinking?

```ts
optional allowDangerousEmailAccountLinking: boolean;
```

⚠️ Security: automatically link accounts by email across OAuth providers.
Only enable if you fully trust every provider to verify email ownership.

#### Default

```ts
false
```

***

### appName?

```ts
optional appName: string;
```

Display name for the application. Used in emails and default UI strings.

#### Default

```ts
"Robo.js"
```

#### Example

```ts
"My Awesome App"
```

***

### basePath?

```ts
optional basePath: string;
```

Base path for all auth routes.

#### Default

```ts
"/api/auth"
```

#### Examples

```ts
"/api/auth"
```

```ts
"/auth"
```

***

### callbacks?

```ts
optional callbacks: object;
```

Auth.js callback hooks.

| Name | Type | Description |
| ------ | ------ | ------ |
| `jwt`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| [`JWT`](Interface.JWT.md)\> | This callback is called whenever a JSON Web Token is created (i.e. at sign in) or updated (i.e whenever a session is accessed in the client). Anything you return here will be saved in the JWT and forwarded to the session callback. There you can control what should be returned to the client. Anything else will be kept from your frontend. The JWT is encrypted by default via your AUTH_SECRET environment variable. [`session` callback](https://authjs.dev/reference/core/types#session) |
| `redirect`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`string`\> | This callback is called anytime the user is redirected to a callback URL (i.e. on signin or signout). By default only URLs on the same host as the origin are allowed. You can use this callback to customise that behaviour. [Documentation](https://authjs.dev/reference/core/types#redirect) **Example** `callbacks: { async redirect({ url, baseUrl }) { // Allows relative callback URLs if (url.startsWith("/")) return `${baseUrl}${url}` // Allows callback URLs on the same origin if (new URL(url).origin === baseUrl) return url return baseUrl } }` |
| `session`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<[`Session`](Interface.Session.md) \| [`DefaultSession`](Interface.DefaultSession.md)\> | This callback is called whenever a session is checked. (i.e. when invoking the `/api/session` endpoint, using `useSession` or `getSession`). The return value will be exposed to the client, so be careful what you return here! If you want to make anything available to the client which you've added to the token through the JWT callback, you have to explicitly return it here as well. :::note ⚠ By default, only a subset (email, name, image) of the token is returned for increased security. ::: The token argument is only available when using the jwt session strategy, and the user argument is only available when using the database session strategy. [`jwt` callback](https://authjs.dev/reference/core/types#jwt) **Example** `callbacks: { async session({ session, token, user }) { // Send properties to the client, like an access_token from a provider. session.accessToken = token.accessToken return session } }` |
| `signIn`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`string` \| `boolean`\> | Controls whether a user is allowed to sign in or not. Returning `true` continues the sign-in flow. Returning `false` or throwing an error will stop the sign-in flow and redirect the user to the error page. Returning a string will redirect the user to the specified URL. Unhandled errors will throw an `AccessDenied` with the message set to the original error. [`AccessDenied`](https://authjs.dev/reference/core/errors#accessdenied) **Example** `callbacks: { async signIn({ profile }) { // Only allow sign in for users with email addresses ending with "yourdomain.com" return profile?.email?.endsWith("@yourdomain.com") } }` |

***

### cookies?

```ts
optional cookies: CookiesOptions;
```

Cookie overrides for Auth.js cookies.

***

### debug?

```ts
optional debug: boolean;
```

Enable verbose Auth.js debug logging.

#### Default

```ts
false
```

***

### email?

```ts
optional email: object;
```

Legacy email configuration (prefer the richer `emails` object).

| Name | Type | Description |
| ------ | ------ | ------ |
| `deliver`? | (...`args`) => `any` | - |
| `expiresInMinutes`? | `number` | - |
| `from`? | `string` | Sender email address (prefer `emails.from`). |
| `sendVerificationRequest`? | (...`args`) => `any` | Custom delivery function (prefer `emails.mailer`). |
| `subject`? | `string` \| (...`args`) => `any` | - |
| `template`? | `string` \| (...`args`) => `any` | HTML template string or function (prefer `emails.templates`). |
| `text`? | `string` \| (...`args`) => `any` | - |

***

### emails?

```ts
optional emails: EmailsOptions;
```

Email system configuration: mailer, templates, and triggers.

***

### events?

```ts
optional events: object;
```

Auth.js event handlers.

| Name | Type | Description |
| ------ | ------ | ------ |
| `createUser`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |
| `linkAccount`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |
| `session`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | The message object will contain one of these depending on if you use JWT or database persisted sessions: - `token`: The JWT for this session. - `session`: The session object from your adapter. |
| `signIn`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | If using a `credentials` type auth, the user is the raw response from your credential provider. For other providers, you'll get the User object from your adapter, the account, and an indicator if the user was new to your Adapter. |
| `signOut`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | The message object will contain one of these depending on if you use JWT or database persisted sessions: - `token`: The JWT for this session. - `session`: The session object from your adapter that is being ended. |
| `updateUser`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |

***

### pages?

```ts
optional pages: PagesOptions;
```

Custom UI page paths for Auth.js built‑in routes.

***

### providers?

```ts
optional providers: Provider[];
```

Array of authentication providers (OAuth, email, credentials).

#### Default

```ts
[]
```

***

### redirectProxyUrl?

```ts
optional redirectProxyUrl: string;
```

Proxy URL used on preview deployments to build correct redirects.

***

### secret?

```ts
optional secret: string;
```

Secret for JWT signing and token hashing.

⚠️ Security: Required in production. Reads from `AUTH_SECRET` or
`NEXTAUTH_SECRET`.

#### Example

```ts
process.env.AUTH_SECRET
```

***

### session?

```ts
optional session: SessionOptions;
```

Session strategy and timing controls.

#### Default

```ts
strategy: adapter ? 'database' : 'jwt', maxAge: 2592000, updateAge: 86400
```

***

### upstream?

```ts
optional upstream: UpstreamOptions;
```

Forward all auth routes to another Robo instance.

#### Default

```ts
cookieName: "authjs.session-token"; sessionStrategy falls back to local strategy when omitted
```

***

### url?

```ts
optional url: string;
```

Canonical app URL used by Auth.js in redirects.
