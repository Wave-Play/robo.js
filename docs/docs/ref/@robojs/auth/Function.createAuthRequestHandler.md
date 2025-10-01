# Function: createAuthRequestHandler()

```ts
function createAuthRequestHandler(config): AuthRequestHandler
```

Bridges Robo.js requests to Auth.js so plugin routes can reuse the official handler.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `config` | [`AuthConfig`](Interface.AuthConfig.md) | Fully prepared Auth.js configuration used to initialize the handler. |

## Returns

`AuthRequestHandler`

An async function accepting Robo.js request/response objects and returning the Auth.js response.

## Examples

```ts
const handler = createAuthRequestHandler(authConfig)
const response = await handler(roboRequest)
```

```ts
export default createAuthRequestHandler(buildAuthConfig({ adapter }))
```
