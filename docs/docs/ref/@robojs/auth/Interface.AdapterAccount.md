# Interface: AdapterAccount

An account is a connection between a user and a provider.

There are two types of accounts:
- OAuth/OIDC accounts, which are created when a user signs in with an OAuth provider.
- Email accounts, which are created when a user signs in with an [Email provider](https://authjs.dev/getting-started/authentication/email).

One user can have multiple accounts.

## Extends

- [`Account`](Interface.Account.md)

## Properties

### access\_token?

```ts
readonly optional access_token: string;
```

#### Inherited from

[`Account`](Interface.Account.md).[`access_token`](Interface.Account.md#access_token)

***

### authorization\_details?

```ts
readonly optional authorization_details: AuthorizationDetails[];
```

#### Inherited from

[`Account`](Interface.Account.md).[`authorization_details`](Interface.Account.md#authorization_details)

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

#### Inherited from

[`Account`](Interface.Account.md).[`expires_at`](Interface.Account.md#expires_at)

***

### expires\_in?

```ts
readonly optional expires_in: number;
```

#### Inherited from

[`Account`](Interface.Account.md).[`expires_in`](Interface.Account.md#expires_in)

***

### id\_token?

```ts
readonly optional id_token: string;
```

#### Inherited from

[`Account`](Interface.Account.md).[`id_token`](Interface.Account.md#id_token)

***

### provider

```ts
provider: string;
```

Provider's id for this account. E.g. "google". See the full list at https://authjs.dev/reference/core/providers

#### Inherited from

[`Account`](Interface.Account.md).[`provider`](Interface.Account.md#provider)

***

### providerAccountId

```ts
providerAccountId: string;
```

This value depends on the type of the provider being used to create the account.
- oauth/oidc: The OAuth account's id, returned from the `profile()` callback.
- email: The user's email address.
- credentials: `id` returned from the `authorize()` callback

#### Inherited from

[`Account`](Interface.Account.md).[`providerAccountId`](Interface.Account.md#provideraccountid)

***

### refresh\_token?

```ts
readonly optional refresh_token: string;
```

#### Inherited from

[`Account`](Interface.Account.md).[`refresh_token`](Interface.Account.md#refresh_token)

***

### scope?

```ts
readonly optional scope: string;
```

#### Inherited from

[`Account`](Interface.Account.md).[`scope`](Interface.Account.md#scope)

***

### token\_type?

```ts
readonly optional token_type: "bearer" | "dpop" | Lowercase<string>;
```

> [!NOTE]\
> Because the value is case insensitive it is always returned lowercased

#### Inherited from

[`Account`](Interface.Account.md).[`token_type`](Interface.Account.md#token_type)

***

### type

```ts
type: AdapterAccountType;
```

Provider's type for this account

#### Overrides

[`Account`](Interface.Account.md).[`type`](Interface.Account.md#type)

***

### userId

```ts
userId: string;
```

id of the user this account belongs to

#### See

https://authjs.dev/reference/core/adapters#adapteruser

#### Overrides

[`Account`](Interface.Account.md).[`userId`](Interface.Account.md#userid)
