# Function: createFlashcoreAdapter()

```ts
function createFlashcoreAdapter(options): PasswordAdapter
```

Creates a password-capable Auth.js adapter that stores users, accounts,
sessions, verification tokens, and password hashes inside Flashcore
namespaces. Supports the full [PasswordAdapter](Interface.PasswordAdapter.md) contract including
helper utilities such as [listUserIds](Function.listUserIds.md) and [listUsers](Function.listUsers.md) for admin
tooling.

Security:
- ⚠️ Verification tokens are hashed with SHA-256 via hashToken before
  storage to prevent leakage if Flashcore is compromised.
- ⚠️ Passwords are hashed with hashPassword using Argon2id (4096 KiB
  memory, 3 passes) and verified via verifyPasswordHash. Plaintext
  passwords are never stored.
- ⚠️ Email addresses are normalized to lowercase before indexing to ensure
  case-insensitive lookups. Keep your application-side normalization in sync.

Performance:
- Most adapter methods require 1–3 Flashcore operations. Consider caching
  session data for extremely high traffic deployments.
- User pagination defaults to 500 users per page; adjust downstream tooling
  or rebuild the index if different sizing is required.

Edge cases:
- Concurrent user creation with the same email can produce duplicates;
  implement application-level locking if this is a concern.
- Deleting a user cascades removal of accounts, sessions, passwords, and
  pagination indexes—this is irreversible.
- `getSessionAndUser` prunes expired sessions on read, so concurrent requests
  might observe brief inconsistencies.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `FlashcoreAdapterOptions` | Requires a `secret` for hashing tokens. Must match the Auth.js config secret. |

## Returns

[`PasswordAdapter`](Interface.PasswordAdapter.md)

PasswordAdapter implementation with Flashcore-backed persistence.

## Examples

```ts
const adapter = createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
```

```ts
export default {
	adapter: createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! }),
	providers: [...]
}
```

```ts
try {
	createFlashcoreAdapter({ secret: process.env.AUTH_SECRET! })
} catch (error) {
	console.error('Adapter initialization failed', error)
}
```

## See

 - PasswordAdapter in `src/builtins/email-password/types.ts`
 - hashPassword and verifyPasswordHash in `src/utils/password-hash.ts`
