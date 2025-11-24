# Function: listPrismaUserIds()

```ts
function listPrismaUserIds(client, options): Promise<object>
```

Retrieves a paginated list of Auth.js user IDs using Prisma. Useful for bulk
operations, admin exports, or background jobs where only identifiers are
needed. Supports custom filtering/ordering via Prisma `where`/`orderBy`
clauses.

⚠️ Security: Do not pass raw user input into `where`/`orderBy` without
validation. Always rely on Prisma's parameterization to avoid SQL injection.

Performance:
- Executes two queries per call (`count` + `findMany`). Cache results or
  limit page sizes for heavy workloads.
- Uses `select: { id: true }` to minimize data transfer.
- Large page sizes (>1000) can increase memory usage and query latency.
- Sorting on non-indexed columns can be slow; add DB indexes for frequent orderings.

Edge cases:
- Out-of-range pages return an empty `ids` array but include metadata.
- Total counts may change between calls if new users are added/deleted.
- Custom filters may yield zero matches; handle `total === 0`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `client` | [`PrismaClientLike`](Interface.PrismaClientLike.md) | Prisma client with a `user` delegate. |
| `options` | `ListUsersOptions` | - |

## Returns

`Promise`\<`object`\>

Object with `ids`, `page`, `pageCount`, and `total` user count.

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

## Examples

```ts
const { ids, pageCount } = await listPrismaUserIds(prisma, { page: 0, pageSize: 100 })
```

```ts
await listPrismaUserIds(prisma, { where: { emailVerified: { not: null } } })
```

```ts
await listPrismaUserIds(prisma, { orderBy: { email: 'asc' } })
```

```ts
const { pageCount } = await listPrismaUserIds(prisma)
for (let page = 0; page < pageCount; page++) {
	const { ids } = await listPrismaUserIds(prisma, { page })
	await process(ids)
}
```

```ts
const { total } = await listPrismaUserIds(prisma, { where: { role: 'admin' } })
if (total === 0) console.log('No admins found')
```

## See

 - DEFAULT_LIST_PAGE_SIZE for defaults.
 - listPrismaUsers for fetching full user objects.
