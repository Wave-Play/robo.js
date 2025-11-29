# Function: signOut()

## signOut(options)

```ts
function signOut(options?): Promise<Response>
```

Calls the Auth.js sign-out route to remove the active session.

### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options`? | `ClientOptions` | Overrides for base path, headers, or a custom fetch implementation. |

### Returns

`Promise`\<`Response`\>

A `Response` emitted by the `/signout` endpoint.

### Examples

```ts
await signOut()
```

```ts
await signOut({ fetch: myEdgeSafeFetch })
```

## signOut(params, proxy, redirect)

```ts
function signOut(
   params?, 
   proxy?, 
redirect?): Promise<Response | object | object | object>
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `params`? | `object` |
| `params.callbackUrl`? | `string` |
| `params.csrfToken`? | `string` |
| `proxy`? | `ClientOptions` |
| `redirect`? | `RedirectMode` |

### Returns

`Promise`\<`Response` \| `object` \| `object` \| `object`\>
