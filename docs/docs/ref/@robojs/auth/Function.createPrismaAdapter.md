# Function: createPrismaAdapter()

```ts
function createPrismaAdapter(options): PasswordAdapter
```

Creates a password-capable Auth.js adapter backed by Prisma. Wraps the
official `@auth/prisma-adapter` and layers on password helpers powered by
hashPassword, verifyPasswordHash, and needsRehash.
Supports automatic password upgrades when Argon2id parameters change.

⚠️ Security:
- Passwords are hashed with Argon2id before storage; plaintext never touches the DB.
- Verification tokens (handled by the base adapter) are hashed with SHA-256.
- Email lookups are case-insensitive; prefer Postgres `@db.Citext` or database collations for enforcement.

Performance:
- Auto-rehashing adds ~50–100 ms to the first login after parameter changes. Consider background migrations for huge user bases.
- Each password operation performs 1–2 queries; ensure `userId` and `email` columns are indexed.
- `findUserIdByEmail` performs two lookups (user + password models). Optimize with database indexes.

Edge cases:
- Requires `@auth/prisma-adapter` and `@prisma/client`. Install both: `npm i @auth/prisma-adapter @prisma/client`.
- Password model must include `id`, `userId`, `email`, `hash`, `createdAt`, `updatedAt` columns.
- Concurrent password updates can race; wrap in application-level locks if necessary.
- `deleteUser` is overridden to remove password rows; omitting this would leave orphaned sensitive data.
- `findUserIdByEmail` falls back to password rows for legacy schemas without `user.email`.

Migration tips:
- Increasing Argon2id parameters triggers on-demand rehashing the next time a user logs in.
- To force migration proactively, iterate through users and call `verifyUserPassword` with a known password (e.g., via user reauthentication flows).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`PrismaAdapterOptions`](Interface.PrismaAdapterOptions.md) |

## Returns

[`PasswordAdapter`](Interface.PasswordAdapter.md)

[PasswordAdapter](Interface.PasswordAdapter.md) implementing Auth.js contract plus password helpers (`createUserPassword`, `verifyUserPassword`, `deleteUserPassword`, `resetUserPassword`, `findUserIdByEmail`).

## Throws

If the Prisma client or password delegate is missing.

## Throws

If `@auth/prisma-adapter` is not installed.

## Examples

```ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
```

```ts
const adapter = createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!,
	hashParameters: { memorySize: 8192, passes: 4 }
})
```

```ts
const adapter = createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!,
	models: { password: 'userPassword' }
})
```

```ts
export default {
	adapter: createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! }),
	providers: [...]
}
```

```ts
try {
	createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
} catch (error) {
	if (String(error).includes('prisma-adapter')) {
		console.error('Install @auth/prisma-adapter before continuing')
	}
}
```

## See

 - PasswordAdapter in `src/builtins/email-password/types.ts`
 - @auth/prisma-adapter for the base adapter implementation.
 - listPrismaUserIds and listPrismaUsers for pagination helpers.
