# Function: getCsrfToken()

```ts
function getCsrfToken(options?): Promise<string | null>
```

Fetches the CSRF token used by Auth.js form submissions.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options`? | `ClientOptions` | Overrides for base path, headers, or a custom fetch implementation. |

## Returns

`Promise`\<`string` \| `null`\>

A string token or `null` if the request fails.

## Examples

```ts
const csrf = await getCsrfToken()
```

```ts
const csrf = await getCsrfToken({ basePath: '/auth' })
```
