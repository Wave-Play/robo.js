# Function: listPrismaUsers()

```ts
function listPrismaUsers(client, options): Promise<object>
```

Lists full Auth.js users with pagination using the provided Prisma client.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `client` | [`PrismaClientLike`](Interface.PrismaClientLike.md) |
| `options` | `ListUsersOptions` |

## Returns

`Promise`\<`object`\>

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

## Example

```ts
const { users } = await listPrismaUsers(prisma, { where: { emailVerified: { not: null } } })
```
