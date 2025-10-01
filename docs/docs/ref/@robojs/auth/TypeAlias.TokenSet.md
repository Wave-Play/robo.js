# Type Alias: TokenSet

```ts
type TokenSet: Partial<TokenEndpointResponse> & object;
```

Different tokens returned by OAuth Providers.
Some of them are available with different casing,
but they refer to the same value.

## Type declaration

### expires\_at?

```ts
optional expires_at: number;
```

Date of when the `access_token` expires in seconds.
This value is calculated from the `expires_in` value.

#### See

https://www.ietf.org/rfc/rfc6749.html#section-4.2.2
