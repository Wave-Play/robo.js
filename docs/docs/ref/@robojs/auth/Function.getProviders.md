# Function: getProviders()

```ts
function getProviders(options?): Promise<PublicProvider[] | null>
```

Lists OAuth, Email, and custom providers configured in Auth.js at runtime.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options`? | `ClientOptions` | Overrides for base path, headers, or a custom fetch implementation. |

## Returns

`Promise`\<[`PublicProvider`](Interface.PublicProvider.md)[] \| `null`\>

A list of available providers or `null` if the response is not successful.

## Examples

```ts
const providers = await getProviders()
```

```ts
const providers = await getProviders({ headers: { cookie: request.headers.get('cookie') ?? '' } })
```
