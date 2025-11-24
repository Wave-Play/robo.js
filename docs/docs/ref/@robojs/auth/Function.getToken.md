# Function: getToken()

```ts
function getToken(input?, options?): Promise<JWT | string | Session | null>
```

Extracts (and optionally decodes) the Auth.js session token. For JWT
strategy, decoding happens locally using the configured secret. For database
strategy, behavior depends on the `raw` option:
- `{ raw: true }`: returns the raw session cookie (string).
- `{ raw: false }` or omitted: returns the full [Session](Interface.Session.md) object.

⚠️ Security:
- Raw cookies are sensitive; never log them. Prefer decoded payloads when possible.
- JWT payloads are signed, not encrypted. Do not store secrets in the token.
- Always verify `exp` before trusting a decoded JWT.

Performance:
- Local JWT decoding (with a secret) takes ~1 ms and avoids HTTP/database calls.
- Database strategy requires fetching the session, which is slower.
- `{ raw: true }` simply reads the cookie value (fastest) but skips validation.

Edge cases:
- Throws if decoding is requested but no secret was configured (proxy mode without `secret`). Use `{ raw: true }` in that case.
- Returns `null` when the cookie is missing/invalid or when runtime is unconfigured.
- Database strategy with `{ raw: false }` returns the full [Session](Interface.Session.md) object, not a JWT.
- Database strategy with `{ raw: true }` returns the raw session cookie string.
- Payload structure depends on your Auth.js `jwt` callback; fields can be added or removed.
- Expired JWTs still decode; check `token.exp` yourself.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input`? | `null` \| `Request` \| `Headers` \| `HeadersInput` | Request/Headers/tuple/record containing cookies. |
| `options`? | `object` | - |
| `options.raw`? | `boolean` | When `true`, returns the raw cookie value. When `false` or omitted, returns decoded JWT (JWT strategy) or Session (database strategy). |

## Returns

`Promise`\<[`JWT`](Interface.JWT.md) \| `string` \| [`Session`](Interface.Session.md) \| `null`\>

[JWT](Interface.JWT.md) payload (JWT strategy), [Session](Interface.Session.md) object (database strategy without raw), raw cookie string (with raw), or `null`.

## Throws

If decoding is requested without a configured secret (JWT strategy only).

## Examples

```ts
const token = await getToken(request)
if (!token || token.exp * 1000 < Date.now()) return new Response('Unauthorized', { status: 401 })
```

```ts
const session = await getToken(request) // Returns Session object
if (!session || !session.user) return new Response('Unauthorized', { status: 401 })
```

```ts
const raw = await getToken(request, { raw: true })
await fetch('https://api.example.com', { headers: { Authorization: `Bearer ${raw}` } })
```

```ts
const token = await getToken(request)
const userId = token?.sub ?? null
```

```ts
const token = await getToken(new Headers({ cookie }))
if (token && token.exp * 1000 < Date.now()) throw new Error('Token expired')
```

## See

 - JWT from `@auth/core/jwt`
 - Session from `@auth/core/types`
 - getServerSession for full session objects
 - coreGetToken from `@auth/core/jwt`
