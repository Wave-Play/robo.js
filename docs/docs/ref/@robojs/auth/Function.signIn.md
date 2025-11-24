# Function: signIn()

## signIn(providerId, body, options)

```ts
function signIn(
   providerId, 
   body?, 
options?): Promise<Response>
```

Initiates the Auth.js sign-in flow for the provided provider identifier.

### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `providerId` | `string` | Provider configured in your Auth.js options, such as `google` or `discord`. |
| `body`? | `Record`\<`string`, `unknown`\> | Additional payload merged into the sign-in request body; defaults to an empty object. |
| `options`? | `ClientOptions` | Overrides for base path, headers, or a custom fetch implementation. |

### Returns

`Promise`\<`Response`\>

A `Response` representing the Auth.js `/signin` endpoint result.

### Examples

```ts
await signIn('google')
```

```ts
await signIn('email', { email: 'user@example.com' }, { basePath: '/custom-auth' })
```

## signIn(providerId, options, proxy, redirect)

```ts
function signIn(
   providerId, 
   options?, 
   proxy?, 
redirect?): Promise<SignInFetchResult | SignInManualResult | SignInRedirectedResult>
```

### Parameters

| Parameter | Type |
| ------ | ------ |
| `providerId` | `string` |
| `options`? | `Record`\<`string`, `unknown`\> & `object` |
| `proxy`? | `ClientOptions` |
| `redirect`? | `RedirectMode` |

### Returns

`Promise`\<`SignInFetchResult` \| `SignInManualResult` \| `SignInRedirectedResult`\>
