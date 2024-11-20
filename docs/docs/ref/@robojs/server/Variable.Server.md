# Variable: Server

```ts
const Server: object;
```

Use this to interact with the server.

## Type declaration

### config()

```ts
config: () => unknown;
```

#### Returns

`unknown`

### get()

```ts
get: () => any;
```

#### Returns

`any`

### ready()

```ts
ready: () => Promise<void>;
```

Returns a promise that resolves when the server is all set up.

#### Returns

`Promise`\<`void`\>
