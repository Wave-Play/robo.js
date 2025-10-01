# Function: getRequestPayload()

```ts
function getRequestPayload(request): Promise<RequestPayloadHandle>
```

Parses the Robo request body once and exposes a reusable payload helper.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `request` | `RoboRequest` | Incoming Robo request whose body should be cached and inspected. |

## Returns

`Promise`\<[`RequestPayloadHandle`](Interface.RequestPayloadHandle.md)\>

A payload handle that exposes `get`, `replace`, and `assign` helpers.

## Example

```ts
const payload = await getRequestPayload(request)
const { email } = payload.get<{ email: string }>()
```
