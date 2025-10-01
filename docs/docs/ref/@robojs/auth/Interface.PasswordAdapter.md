# Interface: PasswordAdapter

Auth.js adapter contract extended with password management helpers.

## Extends

- [`Adapter`](Interface.Adapter.md)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`createAuthenticator`](Interface.Adapter.md#createauthenticator)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`createSession`](Interface.Adapter.md#createsession)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`createUser`](Interface.Adapter.md#createuser)

***

### createUserPassword()

```ts
createUserPassword(params): Promise<PasswordRecord>
```

Persists a hashed password for the given user and returns the storage record.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | `object` |
| `params.email` | `string` |
| `params.password` | `string` |
| `params.userId` | `string` |

#### Returns

`Promise`\<[`PasswordRecord`](Interface.PasswordRecord.md)\>

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`createVerificationToken`](Interface.Adapter.md#createverificationtoken)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`deleteSession`](Interface.Adapter.md#deletesession)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`deleteUser`](Interface.Adapter.md#deleteuser)

***

### deleteUserPassword()

```ts
deleteUserPassword(userId): Promise<void>
```

Removes any stored password material for a user.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `userId` | `string` |

#### Returns

`Promise`\<`void`\>

***

### findUserIdByEmail()

```ts
findUserIdByEmail(email): Promise<null | string>
```

Looks up the internal user id associated with an email address.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `email` | `string` |

#### Returns

`Promise`\<`null` \| `string`\>

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`getAccount`](Interface.Adapter.md#getaccount)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`getAuthenticator`](Interface.Adapter.md#getauthenticator)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`getSessionAndUser`](Interface.Adapter.md#getsessionanduser)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`getUser`](Interface.Adapter.md#getuser)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`getUserByAccount`](Interface.Adapter.md#getuserbyaccount)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`getUserByEmail`](Interface.Adapter.md#getuserbyemail)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`linkAccount`](Interface.Adapter.md#linkaccount)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`listAuthenticatorsByUserId`](Interface.Adapter.md#listauthenticatorsbyuserid)

***

### resetUserPassword()

```ts
resetUserPassword(params): Promise<null | PasswordRecord>
```

Replaces the existing password hash and returns the updated record.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | `object` |
| `params.password` | `string` |
| `params.userId` | `string` |

#### Returns

`Promise`\<`null` \| [`PasswordRecord`](Interface.PasswordRecord.md)\>

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`unlinkAccount`](Interface.Adapter.md#unlinkaccount)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`updateAuthenticatorCounter`](Interface.Adapter.md#updateauthenticatorcounter)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`updateSession`](Interface.Adapter.md#updatesession)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`updateUser`](Interface.Adapter.md#updateuser)

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

#### Inherited from

[`Adapter`](Interface.Adapter.md).[`useVerificationToken`](Interface.Adapter.md#useverificationtoken)

***

### verifyUserPassword()

```ts
verifyUserPassword(params): Promise<boolean>
```

Compares a plaintext password against the stored hash for the user.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `params` | `object` |
| `params.password` | `string` |
| `params.userId` | `string` |

#### Returns

`Promise`\<`boolean`\>
