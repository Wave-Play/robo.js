# Function: listPrismaUsers()

```ts
function listPrismaUsers(client, options): Promise<object>
```

Retrieves paginated [AdapterUser](Interface.AdapterUser.md) records via Prisma. Loads complete
user objects (id, email, name, image, emailVerified) and supports custom
filtering/ordering.

⚠️ Security:
- Avoid exposing raw user objects directly to clients; redact sensitive fields.
- Validate any dynamic filters to prevent leaking data.

Performance:
- Executes two queries per call (`count` + `findMany`).
- Fetching full rows is heavier than [listPrismaUserIds](Function.listPrismaUserIds.md); use IDs when possible.
- Large page sizes can tax memory. Stick to DEFAULT_LIST_PAGE_SIZE or smaller.
- Full exports for massive datasets should run in background jobs or streams.

Edge cases:
- Out-of-range pages return an empty `users` array with metadata.
- Optional fields (name, email, image) may be `null`; always null-check.
- Custom filters may yield zero matches; handle `total === 0`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `client` | [`PrismaClientLike`](Interface.PrismaClientLike.md) | Prisma client with a `user` delegate. |
| `options` | `ListUsersOptions` | - |

## Returns

`Promise`\<`object`\>

Object with `users`, `page`, `pageCount`, and `total` user count.

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

### users

```ts
users: AdapterUser[];
```

## Examples

```ts
const { users, total } = await listPrismaUsers(prisma, { page: 0 })
console.log(`Showing ${users.length} of ${total}`)
```

```ts
await listPrismaUsers(prisma, { where: { emailVerified: { not: null } } })
```

```ts
const { pageCount } = await listPrismaUsers(prisma)
const rows: AdapterUser[] = []
for (let page = 0; page < pageCount; page++) {
	const { users } = await listPrismaUsers(prisma, { page })
	rows.push(...users)
}
```

```ts
await listPrismaUsers(prisma, { pageSize: 50 })
```

## See

 - AdapterUser from `@auth/core/adapters`.
 - listPrismaUserIds for ID-only pagination.
