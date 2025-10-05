# Function: listPrismaUserIds()

```ts
function listPrismaUserIds(client, options): Promise<object>
```

Paged helper that returns only user identifiers via the Prisma client.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `client` | [`PrismaClientLike`](Interface.PrismaClientLike.md) |
| `options` | `ListUsersOptions` |

## Returns

`Promise`\<`object`\>

### ids

```ts
ids: string[];
```

### page

```ts
page: number;
```

### pageCount

```ts
pageCount: number;
```

### total

```ts
total: number;
```

## Example

```ts
const { ids, pageCount } = await listPrismaUserIds(prisma, { page: 0, pageSize: 100 })
```
