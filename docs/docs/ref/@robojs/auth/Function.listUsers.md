# Function: listUsers()

```ts
function listUsers(page): Promise<object>
```

Retrieves paginated [AdapterUser](Interface.AdapterUser.md) records by loading IDs from
[listUserIds](Function.listUserIds.md) and then fetching each user. This is more expensive than
`listUserIds` because it performs `2 + N` Flashcore reads (metadata + page +
N user documents) but returns all user fields (id, email, name, image,
emailVerified).

Edge cases:
- Users deleted between the index read and fetching individual records are
  filtered out, so `users.length` may be less than the page size.
- Out-of-range pages return an empty `users` array with metadata so callers
  can clamp gracefully.
- Custom scripts might have created incomplete user objects; always null
  check optional fields before use.

Performance tips:
- Default page size is DEFAULT_INDEX_PAGE_SIZE. Fetching all users in
  one go may take seconds on large datasets—consider caching (and
  invalidating on create/delete) or running background exports.
- Use `listUserIds` when only IDs are needed to reduce I/O.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `page` | `number` | `0` | Zero-based page index. Defaults to `0`. |

## Returns

`Promise`\<`object`\>

Pagination metadata plus an array of [AdapterUser](Interface.AdapterUser.md) records.

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
const { users, total } = await listUsers(0)
console.log(`Showing ${users.length} of ${total} users`)
```

```ts
const { pageCount } = await listUsers()
const allUsers: AdapterUser[] = []
for (let page = 0; page < pageCount; page++) {
	const { users } = await listUsers(page)
	allUsers.push(...users)
}
```

```ts
const { users } = await listUsers()
const verified = users.filter((user) => user.emailVerified)
```

## See

 - listUserIds for ID-only pagination.
 - AdapterUser from `@auth/core/adapters` for the returned shape.
 - PasswordAdapter.getUser for single-record lookups.
