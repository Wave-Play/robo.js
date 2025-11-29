# Interface: PrismaClientLike

Minimal Prisma client surface required by [createPrismaAdapter](Function.createPrismaAdapter.md).
Compatible with any Prisma version that exposes standard CRUD delegates.

Fields:
- `user`: Required delegate exposing `findUnique/findFirst/findMany/create/update/delete/count`.
- `$transaction?`: Optional transaction helper for future use.

Edge cases:
- If your client removes or renames CRUD helpers, the adapter will throw at runtime.
- Prisma client extensions can wrap delegates; ensure they still expose the methods above.

## Examples

```ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
```

```ts
const prisma = new PrismaClient().$extends({ ...features })
const adapter = createPrismaAdapter({
	client: prisma,
	secret: process.env.AUTH_SECRET!
})
```

## See

PrismaDelegate for expected delegate shape.

## Properties

### $transaction?

```ts
optional $transaction: unknown;
```

***

### user

```ts
user: PrismaDelegate;
```
