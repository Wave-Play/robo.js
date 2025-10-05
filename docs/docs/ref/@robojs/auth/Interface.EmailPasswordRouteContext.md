# Interface: EmailPasswordRouteContext

Arguments provided to Email/Password route overrides while processing a request.

## Properties

### adapter

```ts
adapter: PasswordAdapter;
```

***

### authConfig

```ts
authConfig: AuthConfig;
```

***

### basePath

```ts
basePath: string;
```

***

### baseUrl

```ts
baseUrl: string;
```

***

### cookies

```ts
cookies: CookiesOptions;
```

***

### defaultHandler()

```ts
defaultHandler: () => Promise<Response>;
```

#### Returns

`Promise`\<`Response`\>

***

### events?

```ts
optional events: object;
```

| Name | Type | Description |
| ------ | ------ | ------ |
| `createUser`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |
| `linkAccount`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |
| `session`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | The message object will contain one of these depending on if you use JWT or database persisted sessions: - `token`: The JWT for this session. - `session`: The session object from your adapter. |
| `signIn`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | If using a `credentials` type auth, the user is the raw response from your credential provider. For other providers, you'll get the User object from your adapter, the account, and an indicator if the user was new to your Adapter. |
| `signOut`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | The message object will contain one of these depending on if you use JWT or database persisted sessions: - `token`: The JWT for this session. - `session`: The session object from your adapter that is being ended. |
| `updateUser`? | (`message`) => [`Awaitable`](TypeAlias.Awaitable.md)\<`void`\> | - |

***

### payload

```ts
payload: RequestPayloadHandle;
```

***

### request

```ts
request: RoboRequest;
```

***

### secret

```ts
secret: string;
```

***

### sessionStrategy

```ts
sessionStrategy: "jwt" | "database";
```
