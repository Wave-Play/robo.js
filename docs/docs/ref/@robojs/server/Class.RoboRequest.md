# Class: RoboRequest

Extends the [Web Request API](https://developer.mozilla.org/docs/Web/API/Request) with additional convenience methods.

## Extends

- `Request`

## Properties

| Property | Modifier | Type | Description | Inherited from |
| ------ | ------ | ------ | ------ | ------ |
| `[INTERNALS]` | `public` | `object` | - | - |
| `[INTERNALS].params` | `public` | `Record`\<`string`, `string`\> | - | - |
| `[INTERNALS].raw` | `public` | `IncomingMessage` | - | - |
| `body` | `readonly` | `ReadableStream`\<`Uint8Array`\> | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/body) | `Request.body` |
| `bodyUsed` | `readonly` | `boolean` | [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/bodyUsed) | `Request.bodyUsed` |
| `cache` | `readonly` | `RequestCache` | Returns the cache mode associated with request, which is a string indicating how the request will interact with the browser's cache when fetching. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/cache) | `Request.cache` |
| `credentials` | `readonly` | `RequestCredentials` | Returns the credentials mode associated with request, which is a string indicating whether credentials will be sent with the request always, never, or only when sent to a same-origin URL. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/credentials) | `Request.credentials` |
| `destination` | `readonly` | `RequestDestination` | Returns the kind of resource requested by request, e.g., "document" or "script". [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/destination) | `Request.destination` |
| `headers` | `readonly` | `Headers` | Returns a Headers object consisting of the headers associated with request. Note that headers added in the network layer by the user agent will not be accounted for in this object, e.g., the "Host" header. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/headers) | `Request.headers` |
| `integrity` | `readonly` | `string` | Returns request's subresource integrity metadata, which is a cryptographic hash of the resource being fetched. Its value consists of multiple hashes separated by whitespace. [SRI] [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/integrity) | `Request.integrity` |
| `keepalive` | `readonly` | `boolean` | Returns a boolean indicating whether or not request can outlive the global in which it was created. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/keepalive) | `Request.keepalive` |
| `method` | `readonly` | `string` | Returns request's HTTP method, which is "GET" by default. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/method) | `Request.method` |
| `mode` | `readonly` | `RequestMode` | Returns the mode associated with request, which is a string indicating whether the request will use CORS, or will be restricted to same-origin URLs. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/mode) | `Request.mode` |
| `redirect` | `readonly` | `RequestRedirect` | Returns the redirect mode associated with request, which is a string indicating how redirects for the request will be handled during fetching. A request will follow redirects by default. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/redirect) | `Request.redirect` |
| `referrer` | `readonly` | `string` | Returns the referrer of request. Its value can be a same-origin URL if explicitly set in init, the empty string to indicate no referrer, and "about:client" when defaulting to the global's default. This is used during fetching to determine the value of the `Referer` header of the request being made. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/referrer) | `Request.referrer` |
| `referrerPolicy` | `readonly` | `ReferrerPolicy` | Returns the referrer policy associated with request. This is used during fetching to compute the value of the request's referrer. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/referrerPolicy) | `Request.referrerPolicy` |
| `signal` | `readonly` | `AbortSignal` | Returns the signal associated with request, which is an AbortSignal object indicating whether or not request has been aborted, and its abort event handler. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/signal) | `Request.signal` |
| `url` | `readonly` | `string` | Returns the URL of request as a string. [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/url) | `Request.url` |

## Accessors

### params

#### Get Signature

```ts
get params(): Record<string, string>
```

##### Returns

`Record`\<`string`, `string`\>

***

### query

#### Get Signature

```ts
get query(): Record<string, string | string[]>
```

##### Returns

`Record`\<`string`, `string` \| `string`[]\>

***

### raw

#### Get Signature

```ts
get raw(): IncomingMessage
```

##### Returns

`IncomingMessage`

## Methods

### arrayBuffer()

```ts
arrayBuffer(): Promise<ArrayBuffer>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/arrayBuffer)

#### Returns

`Promise`\<`ArrayBuffer`\>

#### Inherited from

`Request.arrayBuffer`

***

### blob()

```ts
blob(): Promise<Blob>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/blob)

#### Returns

`Promise`\<`Blob`\>

#### Inherited from

`Request.blob`

***

### clone()

```ts
clone(): Request
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/clone)

#### Returns

`Request`

#### Inherited from

`Request.clone`

***

### formData()

```ts
formData(): Promise<FormData>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/formData)

#### Returns

`Promise`\<`FormData`\>

#### Inherited from

`Request.formData`

***

### json()

```ts
json(): Promise<any>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/json)

#### Returns

`Promise`\<`any`\>

#### Inherited from

`Request.json`

***

### text()

```ts
text(): Promise<string>
```

[MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/text)

#### Returns

`Promise`\<`string`\>

#### Inherited from

`Request.text`

***

### from()

```ts
static from(req, options?): Promise<RoboRequest>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `req` | `IncomingMessage` |
| `options`? | `FromOptions` |

#### Returns

`Promise`\<[`RoboRequest`](Class.RoboRequest.md)\>
