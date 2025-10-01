# Interface: VerificationToken

A verification token is a temporary token that is used to sign in a user via their email address.
It is created when a user signs in with an [Email provider](https://authjs.dev/getting-started/authentication/email).
When the user clicks the link in the email, the token and email is sent back to the server
where it is hashed and compared to the value in the database.
If the tokens and emails match, and the token hasn't expired yet, the user is signed in.
The token is then deleted from the database.

## Properties

### expires

```ts
expires: Date;
```

The absolute date when the token expires.

***

### identifier

```ts
identifier: string;
```

The user's email address.

***

### token

```ts
token: string;
```

A [hashed](https://en.wikipedia.org/wiki/Hash_function) token, using the `AuthConfig.secret` value.
