# Function: configureAuthRuntime()

```ts
function configureAuthRuntime(config, options): void
```

Prepares a reusable Auth.js request handler for the Robo runtime utilities.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`AuthConfig`](Interface.AuthConfig.md) | Full Auth.js configuration object used when invoking `Auth()`. |
| `options` | [`ConfigureAuthRuntimeOptions`](Interface.ConfigureAuthRuntimeOptions.md) | Runtime environment values such as base path, base URL, and cookie settings. |

## Returns

`void`

Nothing; sets module-scoped runtime state for subsequent helper calls.

## Examples

```ts
configureAuthRuntime(authConfig, {
  basePath: '/api/auth',
  baseUrl: 'https://example.com',
  cookieName: 'authjs.session-token',
  secret: process.env.AUTH_SECRET!,
  sessionStrategy: 'jwt'
})
```

```ts
configureAuthRuntime(authConfig, {
  basePath: '/internal/auth',
  baseUrl: request.url,
  cookieName: 'custom-auth-token',
  secret: env.AUTH_SECRET,
  sessionStrategy: 'database'
})
```
