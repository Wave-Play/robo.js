# Interface: Account

Usually contains information about the provider being used
and also extends `TokenSet`, which is different tokens returned by OAuth Providers.

## Extends

- `Partial`\<`TokenEndpointResponse`\>

## Extended by

- [`AdapterAccount`](Interface.AdapterAccount.md)

## Properties

### access\_token?

```ts
readonly optional access_token: string;
```

#### Inherited from

`Partial.access_token`

***

### authorization\_details?

```ts
readonly optional authorization_details: AuthorizationDetails[];
```

#### Inherited from

`Partial.authorization_details`

***

### expires\_at?

```ts
optional expires_at: number;
```

Calculated value based on TokenEndpointResponse.expires_in.

It is the absolute timestamp (in seconds) when the TokenEndpointResponse.access_token expires.

This value can be used for implementing token rotation together with TokenEndpointResponse.refresh_token.

#### See

 - https://authjs.dev/guides/refresh-token-rotation#database-strategy
 - https://www.rfc-editor.org/rfc/rfc6749#section-5.1

***

### expires\_in?

```ts
readonly optional expires_in: number;
```

#### Inherited from

`Partial.expires_in`

***

### id\_token?

```ts
readonly optional id_token: string;
```

#### Inherited from

`Partial.id_token`

***

### provider

```ts
provider: string;
```

Provider's id for this account. E.g. "google". See the full list at https://authjs.dev/reference/core/providers

***

### providerAccountId

```ts
providerAccountId: string;
```

This value depends on the type of the provider being used to create the account.
- oauth/oidc: The OAuth account's id, returned from the `profile()` callback.
- email: The user's email address.
- credentials: `id` returned from the `authorize()` callback

***

### refresh\_token?

```ts
readonly optional refresh_token: string;
```

#### Inherited from

`Partial.refresh_token`

***

### scope?

```ts
readonly optional scope: string;
```

#### Inherited from

`Partial.scope`

***

### token\_type?

```ts
readonly optional token_type: "bearer" | "dpop" | Lowercase<string>;
```

> [!NOTE]\
> Because the value is case insensitive it is always returned lowercased

#### Inherited from

`Partial.token_type`

***

### type

```ts
type: ProviderType;
```

Provider's type for this account

***

### userId?

```ts
optional userId: string;
```

id of the user this account belongs to

#### See

https://authjs.dev/reference/core/adapters#adapteruser
