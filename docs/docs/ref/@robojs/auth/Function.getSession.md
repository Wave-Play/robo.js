# Function: getSession()

```ts
function getSession<T>(options?): Promise<T | null>
```

Retrieves the current Auth.js session object, if one exists.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| `T` *extends* [`Session`](Interface.Session.md) | [`Session`](Interface.Session.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options`? | `ClientOptions` | Overrides for base path, headers, or a custom fetch implementation. |

## Returns

`Promise`\<`T` \| `null`\>

The active session payload or `null` when the user is not authenticated.

## Examples

```ts
const session = await getSession()
```

```ts
const session = await getSession({ headers: { cookie: context.cookie } })
```
