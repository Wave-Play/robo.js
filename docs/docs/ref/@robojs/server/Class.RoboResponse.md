# Class: RoboResponse

Extends the [Web Response API](https://developer.mozilla.org/docs/Web/API/Response) with additional convenience methods.

## Extends

- `Response`

## Constructors

### new RoboResponse()

```ts
new RoboResponse(body?, init?): RoboResponse
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body`? | `BodyInit` |
| `init`? | `ResponseInit` |

#### Returns

[`RoboResponse`](Class.RoboResponse.md)

#### Overrides

`Response.constructor`

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| `body` | `readonly` | `ReadableStream`\<`Uint8Array`\> | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/body) | `Response.body` |
| `bodyUsed` | `readonly` | `boolean` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/bodyUsed) | `Response.bodyUsed` |
| `headers` | `readonly` | `Headers` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/headers) | `Response.headers` |
| `ok` | `readonly` | `boolean` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/ok) | `Response.ok` |
| `redirected` | `readonly` | `boolean` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/redirected) | `Response.redirected` |
| `status` | `readonly` | `number` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/status) | `Response.status` |
| `statusText` | `readonly` | `string` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/statusText) | `Response.statusText` |
| `type` | `readonly` | `ResponseType` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/type) | `Response.type` |
| `url` | `readonly` | `string` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/url) | `Response.url` |

## Methods

### arrayBuffer()

```ts
arrayBuffer(): Promise<ArrayBuffer>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/arrayBuffer)

#### Returns

`Promise`\<`ArrayBuffer`\>

#### Inherited from

`Response.arrayBuffer`

***

### blob()

```ts
blob(): Promise<Blob>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/blob)

#### Returns

`Promise`\<`Blob`\>

#### Inherited from

`Response.blob`

***

### clone()

```ts
clone(): Response
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/clone)

#### Returns

`Response`

#### Inherited from

`Response.clone`

***

### formData()

```ts
formData(): Promise<FormData>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/formData)

#### Returns

`Promise`\<`FormData`\>

#### Inherited from

`Response.formData`

***

### json()

```ts
json(): Promise<any>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/json)

#### Returns

`Promise`\<`any`\>

#### Inherited from

`Response.json`

***

### text()

```ts
text(): Promise<string>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/text)

#### Returns

`Promise`\<`string`\>

#### Inherited from

`Response.text`

***

### error()

```ts
static error(): Response
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/error_static)

#### Returns

`Response`

#### Inherited from

`Response.error`

***

### json()

```ts
static json<JsonBody>(body, init?): RoboResponse
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/json_static)

#### Type Parameters

| Type Parameter |
| ------ |
| `JsonBody` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `JsonBody` |
| `init`? | `ResponseInit` |

#### Returns

[`RoboResponse`](Class.RoboResponse.md)

#### Overrides

`Response.json`

***

### redirect()

```ts
static redirect(url, status?): Response
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Response/redirect_static)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `url` | `string` \| `URL` |
| `status`? | `number` |

#### Returns

`Response`

#### Inherited from

`Response.redirect`
