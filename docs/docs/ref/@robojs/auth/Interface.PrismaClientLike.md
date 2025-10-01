# Interface: PrismaClientLike

Describes the minimal surface of a Prisma client that the adapter expects.

## Example

```ts
import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()
const adapter = createPrismaAdapter({ client: prisma, secret: process.env.AUTH_SECRET! })
```

## Indexable

 \[`key`: `string`\]: `PrismaDelegate` \| `unknown`

## Properties

### $transaction()?

```ts
optional $transaction: (...operations) => Promise<unknown>;
```

#### Parameters

| Parameter | Type |
| ------ | ------ |
| ...`operations` | `unknown`[] |

#### Returns

`Promise`\<`unknown`\>

***

### user

```ts
user: PrismaDelegate;
```
