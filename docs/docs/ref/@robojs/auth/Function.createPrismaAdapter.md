# Function: createPrismaAdapter()

```ts
function createPrismaAdapter(options): PasswordAdapter
```

Creates a password-capable Auth.js adapter backed by Prisma models.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`PrismaAdapterOptions`](Interface.PrismaAdapterOptions.md) |

## Returns

[`PasswordAdapter`](Interface.PasswordAdapter.md)

## Example

```ts
import { createPrismaAdapter } from '@robojs/auth/adapters/prisma'
const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
```
