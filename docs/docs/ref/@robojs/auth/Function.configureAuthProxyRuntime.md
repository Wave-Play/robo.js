# Function: configureAuthProxyRuntime()

```ts
function configureAuthProxyRuntime(options): void
```

Configures upstream proxy mode where Robo forwards auth routes to another
instance. Useful for preview deployments, microservices, or centralized auth
clusters.

⚠️ Security:
- Upstream `baseUrl` should be HTTPS. Avoid proxying over plaintext HTTP in production.
- Additional headers may contain secrets; lock down upstream validation.

Performance:
- Every [getServerSession](Function.getServerSession.md) call becomes an HTTP request; consider caching responses.
- Providing `options.secret` enables local JWT decoding via [getToken](Function.getToken.md), reducing upstream calls by 50%+.

Edge cases:
- Must be called before any proxy-auth routes execute (just like local mode).
- Calling multiple times overwrites previous state.
- Network failures bubble up; wrap callers with retries if necessary.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`ConfigureAuthProxyRuntimeOptions`](Interface.ConfigureAuthProxyRuntimeOptions.md) | See [ConfigureAuthProxyRuntimeOptions](Interface.ConfigureAuthProxyRuntimeOptions.md) for details. |

## Returns

`void`

Nothing; sets module-scoped state for helpers.

## Examples

```ts
configureAuthProxyRuntime({
	localBasePath: '/api/auth',
	targetBasePath: '/api/auth',
	baseUrl: 'https://auth.example.com',
	sessionStrategy: 'jwt'
})
```

```ts
configureAuthProxyRuntime({
	localBasePath: '/api/auth',
	baseUrl: 'https://auth.example.com',
	sessionStrategy: 'jwt',
	headers: { 'X-API-Key': process.env.INTERNAL_API_KEY! }
})
```

```ts
configureAuthProxyRuntime({
	localBasePath: '/api/auth',
	baseUrl: 'https://auth.example.com',
	sessionStrategy: 'jwt',
	secret: process.env.AUTH_SECRET
})
```

## See

 - configureAuthRuntime for local mode
 - getServerSession for downstream consumption
 - getToken for JWT behavior in proxy mode
 - resolveFetch
 - normalizePath
 - ../../AGENTS.md for upstream proxy guidance
