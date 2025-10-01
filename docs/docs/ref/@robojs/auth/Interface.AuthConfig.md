# Interface: AuthConfig

Configure the Auth method.

## Example

```ts
import Auth, { type AuthConfig } from "@auth/core"

export const authConfig: AuthConfig = {...}

const request = new Request("https://example.com")
const response = await AuthHandler(request, authConfig)
```

## See

[Initialization](https://authjs.dev/reference/core/types#authconfig)

## Properties

### adapter?

```ts
optional adapter: Adapter;
```

You can use the adapter option to pass in your database adapter.

***

### basePath?

```ts
optional basePath: string;
```

The base path of the Auth.js API endpoints.

#### Default

```ts
"/api/auth" in "next-auth"; "/auth" with all other frameworks
```

***

### callbacks?

```ts
optional callbacks: object;
```

Callbacks are asynchronous functions you can use to control what happens when an action is performed.
Callbacks are *extremely powerful*, especially in scenarios involving JSON Web Tokens
as they **allow you to implement access controls without a database** and to **integrate with external databases or APIs**.

| Name | Type | Description |
| ------ | ------ | ------ |
| `jwt`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| [`JWT`](Interface.JWT.md)\> | This callback is called whenever a JSON Web Token is created (i.e. at sign in) or updated (i.e whenever a session is accessed in the client). Anything you return here will be saved in the JWT and forwarded to the session callback. There you can control what should be returned to the client. Anything else will be kept from your frontend. The JWT is encrypted by default via your AUTH_SECRET environment variable. [`session` callback](https://authjs.dev/reference/core/types#session) |
| `redirect`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`string`\> | This callback is called anytime the user is redirected to a callback URL (i.e. on signin or signout). By default only URLs on the same host as the origin are allowed. You can use this callback to customise that behaviour. [Documentation](https://authjs.dev/reference/core/types#redirect) **Example** `callbacks: { async redirect({ url, baseUrl }) { // Allows relative callback URLs if (url.startsWith("/")) return `${baseUrl}${url}` // Allows callback URLs on the same origin if (new URL(url).origin === baseUrl) return url return baseUrl } }` |
| `session`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<[`Session`](Interface.Session.md) \| [`DefaultSession`](Interface.DefaultSession.md)\> | This callback is called whenever a session is checked. (i.e. when invoking the `/api/session` endpoint, using `useSession` or `getSession`). The return value will be exposed to the client, so be careful what you return here! If you want to make anything available to the client which you've added to the token through the JWT callback, you have to explicitly return it here as well. :::note ⚠ By default, only a subset (email, name, image) of the token is returned for increased security. ::: The token argument is only available when using the jwt session strategy, and the user argument is only available when using the database session strategy. [`jwt` callback](https://authjs.dev/reference/core/types#jwt) **Example** `callbacks: { async session({ session, token, user }) { // Send properties to the client, like an access_token from a provider. session.accessToken = token.accessToken return session } }` |
| `signIn`? | (`params`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`string` \| `boolean`\> | Controls whether a user is allowed to sign in or not. Returning `true` continues the sign-in flow. Returning `false` or throwing an error will stop the sign-in flow and redirect the user to the error page. Returning a string will redirect the user to the specified URL. Unhandled errors will throw an `AccessDenied` with the message set to the original error. [`AccessDenied`](https://authjs.dev/reference/core/errors#accessdenied) **Example** `callbacks: { async signIn({ profile }) { // Only allow sign in for users with email addresses ending with "yourdomain.com" return profile?.email?.endsWith("@yourdomain.com") } }` |

***

### cookies?

```ts
optional cookies: Partial<CookiesOptions>;
```

You can override the default cookie names and options for any of the cookies used by Auth.js.
You can specify one or more cookies with custom properties
and missing options will use the default values defined by Auth.js.
If you use this feature, you will likely want to create conditional behavior
to support setting different cookies policies in development and production builds,
as you will be opting out of the built-in dynamic policy.

- ⚠ **This is an advanced option.** Advanced options are passed the same way as basic options,
but **may have complex implications** or side effects.
You should **try to avoid using advanced options** unless you are very comfortable using them.

#### Default

```ts
{}
```

***

### debug?

```ts
optional debug: boolean;
```

Set debug to true to enable debug messages for authentication and database operations.

- ⚠ If you added a custom [AuthConfig.logger](Interface.AuthConfig.md#logger), this setting is ignored.

#### Default

```ts
false
```

***

### events?

```ts
optional events: object;
```

Events are asynchronous functions that do not return a response, they are useful for audit logging.
You can specify a handler for any of these events below - e.g. for debugging or to create an audit log.
The content of the message object varies depending on the flow
(e.g. OAuth or Email authentication flow, JWT or database sessions, etc),
but typically contains a user object and/or contents of the JSON Web Token
and other information relevant to the event.

| Name | Type | Description |
| ------ | ------ | ------ |
| `createUser`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |
| `linkAccount`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |
| `session`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | The message object will contain one of these depending on if you use JWT or database persisted sessions: - `token`: The JWT for this session. - `session`: The session object from your adapter. |
| `signIn`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | If using a `credentials` type auth, the user is the raw response from your credential provider. For other providers, you'll get the User object from your adapter, the account, and an indicator if the user was new to your Adapter. |
| `signOut`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | The message object will contain one of these depending on if you use JWT or database persisted sessions: - `token`: The JWT for this session. - `session`: The session object from your adapter that is being ended. |
| `updateUser`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |

#### Default

```ts
{}
```

***

### experimental?

```ts
optional experimental: object;
```

Use this option to enable experimental features.
When enabled, it will print a warning message to the console.

| Name | Type | Description |
| ------ | ------ | ------ |
| `enableWebAuthn`? | `boolean` | Enable WebAuthn support. **Default** `false` |

#### Note

Experimental features are not guaranteed to be stable and may change or be removed without notice. Please use with caution.

#### Default

```ts
{}
```

***

### jwt?

```ts
optional jwt: Partial<JWTOptions>;
```

JSON Web Tokens are enabled by default if you have not specified an [AuthConfig.adapter](Interface.AuthConfig.md#adapter).
JSON Web Tokens are encrypted (JWE) by default. We recommend you keep this behaviour.

***

### logger?

```ts
optional logger: Partial<LoggerInstance>;
```

Override any of the logger levels (`undefined` levels will use the built-in logger),
and intercept logs in NextAuth. You can use this option to send NextAuth logs to a third-party logging service.

#### Example

```ts
// /auth.ts
import log from "logging-service"

export const { handlers, auth, signIn, signOut } = NextAuth({
  logger: {
    error(code, ...message) {
      log.error(code, message)
    },
    warn(code, ...message) {
      log.warn(code, message)
    },
    debug(code, ...message) {
      log.debug(code, message)
    }
  }
})
```

- ⚠ When set, the [AuthConfig.debug](Interface.AuthConfig.md#debug) option is ignored

#### Default

```ts
console
```

***

### pages?

```ts
optional pages: Partial<PagesOptions>;
```

Specify URLs to be used if you want to create custom sign in, sign out and error pages.
Pages specified will override the corresponding built-in page.

#### Default

```ts
{}
```

#### Example

```ts
  pages: {
    signIn: '/auth/signin',
    signOut: '/auth/signout',
    error: '/auth/error',
    verifyRequest: '/auth/verify-request',
    newUser: '/auth/new-user'
  }
```

***

### providers

```ts
providers: Provider[];
```

List of authentication providers for signing in
(e.g. Google, Facebook, Twitter, GitHub, Email, etc) in any order.
This can be one of the built-in providers or an object with a custom provider.

#### Default

```ts
[]
```

***

### raw?

```ts
optional raw: typeof raw;
```

***

### redirectProxyUrl?

```ts
optional redirectProxyUrl: string;
```

When set, during an OAuth sign-in flow,
the `redirect_uri` of the authorization request
will be set based on this value.

This is useful if your OAuth Provider only supports a single `redirect_uri`
or you want to use OAuth on preview URLs (like Vercel), where you don't know the final deployment URL beforehand.

The url needs to include the full path up to where Auth.js is initialized.

#### Note

This will auto-enable the `state` OAuth2Config.checks on the provider.

#### Examples

```
"https://authjs.example.com/api/auth"
```

You can also override this individually for each provider.

```ts
GitHub({
  ...
  redirectProxyUrl: "https://github.example.com/api/auth"
})
```

#### Default

`AUTH_REDIRECT_PROXY_URL` environment variable

See also: [Guide: Securing a Preview Deployment](https://authjs.dev/getting-started/deployment#securing-a-preview-deployment)

***

### secret?

```ts
optional secret: string | string[];
```

A random string used to hash tokens, sign cookies and generate cryptographic keys.

To generate a random string, you can use the Auth.js CLI: `npx auth secret`

#### Note

You can also pass an array of secrets, in which case the first secret that successfully
decrypts the JWT will be used. This is useful for rotating secrets without invalidating existing sessions.
The newer secret should be added to the start of the array, which will be used for all new sessions.

***

### session?

```ts
optional session: object;
```

Configure your session like if you want to use JWT or a database,
how long until an idle session expires, or to throttle write operations in case you are using a database.

| Name | Type | Description |
| ------ | ------ | ------ |
| `generateSessionToken`? | () => `string` | Generate a custom session token for database-based sessions. By default, a random UUID or string is generated depending on the Node.js version. However, you can specify your own custom string (such as CUID) to be used. **Default** `randomUUID` or `randomBytes.toHex` depending on the Node.js version |
| `maxAge`? | `number` | Relative time from now in seconds when to expire the session **Default** `2592000 // 30 days` |
| `strategy`? | `"jwt"` \| `"database"` | Choose how you want to save the user session. The default is `"jwt"`, an encrypted JWT (JWE) in the session cookie. If you use an `adapter` however, we default it to `"database"` instead. You can still force a JWT session by explicitly defining `"jwt"`. When using `"database"`, the session cookie will only contain a `sessionToken` value, which is used to look up the session in the database. [Documentation](https://authjs.dev/reference/core#authconfig#session) | [Adapter](https://authjs.dev/reference/core#authconfig#adapter) | [About JSON Web Tokens](https://authjs.dev/concepts/session-strategies#jwt-session) |
| `updateAge`? | `number` | How often the session should be updated in seconds. If set to `0`, session is updated every time. **Default** `86400 // 1 day` |

***

### skipCSRFCheck?

```ts
optional skipCSRFCheck: typeof skipCSRFCheck;
```

***

### theme?

```ts
optional theme: Theme;
```

Changes the theme of built-in [AuthConfig.pages](Interface.AuthConfig.md#pages).

***

### trustHost?

```ts
optional trustHost: boolean;
```

Auth.js relies on the incoming request's `host` header to function correctly. For this reason this property needs to be set to `true`.

Make sure that your deployment platform sets the `host` header safely.

:::note
Official Auth.js-based libraries will attempt to set this value automatically for some deployment platforms (eg.: Vercel) that are known to set the `host` header safely.
:::

***

### useSecureCookies?

```ts
optional useSecureCookies: boolean;
```

When set to `true` then all cookies set by NextAuth.js will only be accessible from HTTPS URLs.
This option defaults to `false` on URLs that start with `http://` (e.g. http://localhost:3000) for developer convenience.
You can manually set this option to `false` to disable this security feature and allow cookies
to be accessible from non-secured URLs (this is not recommended).

- ⚠ **This is an advanced option.** Advanced options are passed the same way as basic options,
but **may have complex implications** or side effects.
You should **try to avoid using advanced options** unless you are very comfortable using them.

The default is `false` HTTP and `true` for HTTPS sites.
