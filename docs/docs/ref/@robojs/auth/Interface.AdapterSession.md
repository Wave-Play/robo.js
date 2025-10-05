# Interface: AdapterSession

A session holds information about a user's current signin state.

## Properties

### expires

```ts
expires: Date;
```

The absolute date when the session expires.

If a session is accessed prior to its expiry date,
it will be extended based on the `maxAge` option as defined in by `SessionOptions.maxAge`.
It is never extended more than once in a period defined by `SessionOptions.updateAge`.

If a session is accessed past its expiry date,
it will be removed from the database to clean up inactive sessions.

***

### sessionToken

```ts
sessionToken: string;
```

A randomly generated value that is used to look up the session in the database
when using `"database"` `AuthConfig.strategy` option.
This value is saved in a secure, HTTP-Only cookie on the client.

***

### userId

```ts
userId: string;
```

Connects the active session to a user in the database
