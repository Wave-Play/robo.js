# Function: getServerSession()

```ts
function getServerSession(input?): Promise<Session | null>
```

Resolves the current Auth.js session by invoking the session route directly.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input`? | `null` \| `Request` \| `Headers` \| `HeadersInput` | Request or headers used to infer cookies; defaults to an empty header set. |

## Returns

`Promise`\<[`Session`](Interface.Session.md) \| `null`\>

The active Auth.js session or `null` when no session is available.

## Examples

```ts
const session = await getServerSession(request)
```

```ts
const session = await getServerSession(new Request(url, { headers: myHeaders }))
```
