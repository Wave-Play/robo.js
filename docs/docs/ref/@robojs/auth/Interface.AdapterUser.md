# Interface: AdapterUser

A user represents a person who can sign in to the application.
If a user does not exist yet, it will be created when they sign in for the first time,
using the information (profile data) returned by the identity provider.
A corresponding account is also created and linked to the user.

## Extends

- [`User`](Interface.User.md)

## Properties

### email

```ts
email: string;
```

The user's email address.

#### Overrides

[`User`](Interface.User.md).[`email`](Interface.User.md#email)

***

### emailVerified

```ts
emailVerified: null | Date;
```

Whether the user has verified their email address via an [Email provider](https://authjs.dev/getting-started/authentication/email).
It is `null` if the user has not signed in with the Email provider yet, or the date of the first successful signin.

***

### id

```ts
id: string;
```

A unique identifier for the user.

#### Overrides

[`User`](Interface.User.md).[`id`](Interface.User.md#id)

***

### image?

```ts
optional image: null | string;
```

#### Inherited from

[`User`](Interface.User.md).[`image`](Interface.User.md#image)

***

### name?

```ts
optional name: null | string;
```

#### Inherited from

[`User`](Interface.User.md).[`name`](Interface.User.md#name)
