# Function: configureAuthRuntime()

```ts
function configureAuthRuntime(config, options): void
```

Initializes Auth.js in local mode by creating a reusable handler that Robo's
server utilities can call. Invoke this during plugin startup (e.g., inside
the `_start` event) before any auth routes are accessed.

⚠️ Security:
- Call from server-only code; `config` often contains provider secrets.
- Do not log the `config` object or runtime options in production.

Performance:
- The Auth handler is created once and reused for every request (no per-request setup).
- ensureCredentialsDbCompatibility mutates `config` to add database support; the patch is cached on the object.

Edge cases:
- Calling multiple times overwrites the previous configuration; call once.
- Must run before any auth route executes, otherwise helpers throw "unconfigured" errors.
- `config` is mutated. Clone it first if you need the original object elsewhere.
- `options.sessionStrategy` must match your Auth.js adapter/session configuration (JWT vs database).
- `options.basePath` must match the Auth.js config `basePath` or Auth routes will 404.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`AuthConfig`](Interface.AuthConfig.md) | Complete Auth.js configuration (providers, adapter, callbacks, etc.). |
| `options` | [`ConfigureAuthRuntimeOptions`](Interface.ConfigureAuthRuntimeOptions.md) | Runtime values ([ConfigureAuthRuntimeOptions](Interface.ConfigureAuthRuntimeOptions.md)). |

## Returns

`void`

Nothing; sets module-scoped state used by [getServerSession](Function.getServerSession.md) and [getToken](Function.getToken.md).

## Examples

```ts
export default async function start() {
	const config: AuthConfig = { providers: [...], adapter: createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! }) }
	configureAuthRuntime(config, {
		basePath: '/api/auth',
		baseUrl: process.env.AUTH_URL!,
		cookieName: 'authjs.session-token',
		secret: process.env.AUTH_SECRET!,
		sessionStrategy: 'database'
	})
}
```

```ts
configureAuthRuntime(authConfig, {
	basePath: '/internal/auth',
	baseUrl: 'https://example.com',
	cookieName: '__Secure-authjs.session-token',
	secret: process.env.AUTH_SECRET!,
	sessionStrategy: 'jwt'
})
```

## See

 - ensureCredentialsDbCompatibility
 - Auth from `@auth/core`
 - getServerSession
 - getToken
 - configureAuthProxyRuntime for proxy mode
