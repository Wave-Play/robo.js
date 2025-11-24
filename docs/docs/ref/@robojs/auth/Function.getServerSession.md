# Function: getServerSession()

```ts
function getServerSession(input?): Promise<Session | null>
```

Retrieves the active Auth.js [Session](Interface.Session.md) using the configured runtime.
In local mode this calls the Auth.js handler directly; in proxy mode it
forwards the request to the upstream server.

⚠️ Security:
- Session objects may contain sensitive user data. Redact fields before
  logging or sending to clients.
- Proxy mode forwards cookies to the upstream server; ensure the upstream is trusted.

Performance:
- Local mode avoids network I/O (one handler invocation).
- Proxy mode incurs an HTTP call per invocation; cache results or use JWTs if latency is critical.
- Expired sessions are pruned automatically to prevent repeated DB hits.
- Database session strategy may trigger additional database queries, whereas JWT strategy primarily decodes cookies.
- Cache session data for hot routes when possible and invalidate on sign-in/sign-out events.

Edge cases:
- Throws if runtime is unconfigured ([configureAuthRuntime](Function.configureAuthRuntime.md) or [configureAuthProxyRuntime](Function.configureAuthProxyRuntime.md) not called).
- Returns `null` when cookies are missing/invalid/expired or when network errors occur (proxy mode); guard against `null` and consider retry logic if upstream requests fail.
- Session shape depends on your Auth.js callbacks; additional fields may appear or be omitted.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input`? | `null` \| `Request` \| `Headers` \| `HeadersInput` | Optional Request/Headers/tuple/record providing cookies. Defaults to empty headers. |

## Returns

`Promise`\<[`Session`](Interface.Session.md) \| `null`\>

[Session](Interface.Session.md) or `null` if no session is available.

## Throws

If the runtime has not been configured.

## Examples

```ts
export default async function handler(request: Request) {
	const session = await getServerSession(request)
	if (!session) return new Response('Unauthorized', { status: 401 })
	return new Response(`Hello ${session.user?.name ?? 'friend'}`)
}
```

```ts
const session = await getServerSession(new Headers({ cookie: request.headers.get('cookie') ?? '' }))
```

```ts
async function requireSession(request: Request) {
	const session = await getServerSession(request)
	if (!session) throw new Error('Unauthorized')
	return session
}
```

```ts
const session = await getServerSession(request)
if (session && !session.user?.emailVerified) {
	return new Response('Email not verified', { status: 403 })
}
```

## See

 - configureAuthRuntime
 - configureAuthProxyRuntime
 - getToken for JWT-only access
 - AuthConfig['callbacks']['session'] for customizing payloads
