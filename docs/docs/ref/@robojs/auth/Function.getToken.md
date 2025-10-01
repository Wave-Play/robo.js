# Function: getToken()

```ts
function getToken(input?, options?): Promise<JWT | string | null>
```

Extracts the Auth.js session token derived from the provided context.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `input`? | `null` \| `Request` \| `Headers` \| `HeadersInput` | Incoming request or headers whose cookies contain the Auth.js session token. |
| `options`? | `object` | Set `raw` to `true` to receive the unparsed cookie value instead of a decoded JWT payload. |
| `options.raw`? | `boolean` | - |

## Returns

`Promise`\<[`JWT`](Interface.JWT.md) \| `string` \| `null`\>

The decoded JWT, the raw cookie value, or `null` if no token could be resolved.

## Examples

```ts
const token = await getToken(request, { raw: true })
```

```ts
const payload = await getToken(headers, { raw: false })
```
