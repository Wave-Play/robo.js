# Interface: EmailPasswordAuthorizeContext

Context object passed to custom `authorize` implementations.

## Properties

### adapter

```ts
adapter: PasswordAdapter;
```

***

### defaultAuthorize()

```ts
defaultAuthorize: () => Promise<null | AdapterUser>;
```

#### Returns

`Promise`\<`null` \| [`AdapterUser`](Interface.AdapterUser.md)\>

***

### request

```ts
request: undefined | Request;
```
