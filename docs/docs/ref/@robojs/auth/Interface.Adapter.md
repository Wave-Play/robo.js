# Interface: Adapter

An adapter is an object with function properties (methods) that read and write data from a data source.
Think of these methods as a way to normalize the data layer to common interfaces that Auth.js can understand.

This is what makes Auth.js very flexible and allows it to be used with any data layer.

The adapter methods are used to perform the following operations:
- Create/update/delete a user
- Link/unlink an account to/from a user
- Handle active sessions
- Support passwordless authentication across multiple devices

:::note
If any of the methods are not implemented, but are called by Auth.js,
an error will be shown to the user and the operation will fail.
:::

## Extended by

- [`PasswordAdapter`](Interface.PasswordAdapter.md)

## Methods

### createAuthenticator()?

```ts
optional createAuthenticator(authenticator): Awaitable<AdapterAuthenticator>
```

Create a new authenticator.

If the creation fails, the adapter must throw an error.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `authenticator` | `AdapterAuthenticator` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`AdapterAuthenticator`\>

***

### createSession()?

```ts
optional createSession(session): Awaitable<AdapterSession>
```

Creates a session for the user and returns it.

See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `session` | `object` |
| `session.expires` | `Date` |
| `session.sessionToken` | `string` |
| `session.userId` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<[`AdapterSession`](Interface.AdapterSession.md)\>

***

### createUser()?

```ts
optional createUser(user): Awaitable<AdapterUser>
```

Creates a user in the database and returns it.

See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `user` | [`AdapterUser`](Interface.AdapterUser.md) |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<[`AdapterUser`](Interface.AdapterUser.md)\>

***

### createVerificationToken()?

```ts
optional createVerificationToken(verificationToken): Awaitable<undefined | null | VerificationToken>
```

Creates a verification token and returns it.

See also [Verification tokens](https://authjs.dev/guides/creating-a-database-adapter#verification-tokens)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `verificationToken` | [`VerificationToken`](Interface.VerificationToken.md) |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`undefined` \| `null` \| [`VerificationToken`](Interface.VerificationToken.md)\>

***

### deleteSession()?

```ts
optional deleteSession(sessionToken): Promise<void> | Awaitable<undefined | null | AdapterSession>
```

Deletes a session from the database. It is preferred that this method also
returns the session that is being deleted for logging purposes.

See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sessionToken` | `string` |

#### Returns

`Promise`\<`void`\> \| [`Awaitable`](TypeAlias.Awaitable.md)\<`undefined` \| `null` \| [`AdapterSession`](Interface.AdapterSession.md)\>

***

### deleteUser()?

```ts
optional deleteUser(userId): Promise<void> | Awaitable<undefined | null | AdapterUser>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `userId` | `string` |

#### Returns

`Promise`\<`void`\> \| [`Awaitable`](TypeAlias.Awaitable.md)\<`undefined` \| `null` \| [`AdapterUser`](Interface.AdapterUser.md)\>

#### Todo

This method is currently not invoked yet.

See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)

***

### getAccount()?

```ts
optional getAccount(providerAccountId, provider): Awaitable<null | AdapterAccount>
```

Get account by provider account id and provider.

If an account is not found, the adapter must return `null`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `providerAccountId` | `string` |
| `provider` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| [`AdapterAccount`](Interface.AdapterAccount.md)\>

***

### getAuthenticator()?

```ts
optional getAuthenticator(credentialID): Awaitable<null | AdapterAuthenticator>
```

Returns an authenticator from its credentialID.

If an authenticator is not found, the adapter must return `null`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `credentialID` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| `AdapterAuthenticator`\>

***

### getSessionAndUser()?

```ts
optional getSessionAndUser(sessionToken): Awaitable<null | object>
```

Returns a session and a userfrom the database in one go.

:::tip
If the database supports joins, it's recommended to reduce the number of database queries.
:::

See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sessionToken` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| `object`\>

***

### getUser()?

```ts
optional getUser(id): Awaitable<null | AdapterUser>
```

Returns a user from the database via the user id.

See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| [`AdapterUser`](Interface.AdapterUser.md)\>

***

### getUserByAccount()?

```ts
optional getUserByAccount(providerAccountId): Awaitable<null | AdapterUser>
```

Using the provider id and the id of the user for a specific account, get the user.

See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `providerAccountId` | `Pick`\<[`AdapterAccount`](Interface.AdapterAccount.md), `"provider"` \| `"providerAccountId"`\> |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| [`AdapterUser`](Interface.AdapterUser.md)\>

***

### getUserByEmail()?

```ts
optional getUserByEmail(email): Awaitable<null | AdapterUser>
```

Returns a user from the database via the user's email address.

See also [Verification tokens](https://authjs.dev/guides/creating-a-database-adapter#verification-tokens)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `email` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| [`AdapterUser`](Interface.AdapterUser.md)\>

***

### linkAccount()?

```ts
optional linkAccount(account): Promise<void> | Awaitable<undefined | null | AdapterAccount>
```

This method is invoked internally (but optionally can be used for manual linking).
It creates an [Account](https://authjs.dev/reference/core/adapters#models) in the database.

See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `account` | [`AdapterAccount`](Interface.AdapterAccount.md) |

#### Returns

`Promise`\<`void`\> \| [`Awaitable`](TypeAlias.Awaitable.md)\<`undefined` \| `null` \| [`AdapterAccount`](Interface.AdapterAccount.md)\>

***

### listAuthenticatorsByUserId()?

```ts
optional listAuthenticatorsByUserId(userId): Awaitable<AdapterAuthenticator[]>
```

Returns all authenticators from a user.

If a user is not found, the adapter should still return an empty array.
If the retrieval fails for some other reason, the adapter must throw an error.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `userId` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`AdapterAuthenticator`[]\>

***

### unlinkAccount()?

```ts
optional unlinkAccount(providerAccountId): Promise<void> | Awaitable<undefined | AdapterAccount>
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `providerAccountId` | `Pick`\<[`AdapterAccount`](Interface.AdapterAccount.md), `"provider"` \| `"providerAccountId"`\> |

#### Returns

`Promise`\<`void`\> \| [`Awaitable`](TypeAlias.Awaitable.md)\<`undefined` \| [`AdapterAccount`](Interface.AdapterAccount.md)\>

#### Todo

This method is currently not invoked yet.

***

### updateAuthenticatorCounter()?

```ts
optional updateAuthenticatorCounter(credentialID, newCounter): Awaitable<AdapterAuthenticator>
```

Updates an authenticator's counter.

If the update fails, the adapter must throw an error.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `credentialID` | `string` |
| `newCounter` | `number` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`AdapterAuthenticator`\>

***

### updateSession()?

```ts
optional updateSession(session): Awaitable<undefined | null | AdapterSession>
```

Updates a session in the database and returns it.

See also [Database Session management](https://authjs.dev/guides/creating-a-database-adapter#database-session-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `session` | `Partial`\<[`AdapterSession`](Interface.AdapterSession.md)\> & `Pick`\<[`AdapterSession`](Interface.AdapterSession.md), `"sessionToken"`\> |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`undefined` \| `null` \| [`AdapterSession`](Interface.AdapterSession.md)\>

***

### updateUser()?

```ts
optional updateUser(user): Awaitable<AdapterUser>
```

Updates a user in the database and returns it.

See also [User management](https://authjs.dev/guides/creating-a-database-adapter#user-management)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `user` | `Partial`\<[`AdapterUser`](Interface.AdapterUser.md)\> & `Pick`\<[`AdapterUser`](Interface.AdapterUser.md), `"id"`\> |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<[`AdapterUser`](Interface.AdapterUser.md)\>

***

### useVerificationToken()?

```ts
optional useVerificationToken(params): Awaitable<null | VerificationToken>
```

Return verification token from the database and deletes it
so it can only be used once.

See also [Verification tokens](https://authjs.dev/guides/creating-a-database-adapter#verification-tokens)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | `object` |
| `params.identifier` | `string` |
| `params.token` | `string` |

#### Returns

[`Awaitable`](TypeAlias.Awaitable.md)\<`null` \| [`VerificationToken`](Interface.VerificationToken.md)\>
