# Function: listUserIds()

```ts
function listUserIds(page): Promise<object>
```

Retrieves a paginated list of user IDs from the Flashcore user index. This
helper is ideal for bulk operations, admin dashboards, or migrations where
you only need identifiers instead of full [AdapterUser](Interface.AdapterUser.md) records.

Each call reads the index metadata plus the requested page (2 Flashcore I/O
operations). Cache results if you query the same page repeatedly. The
default page size is DEFAULT_INDEX_PAGE_SIZE (500 users). Fetching
every page for large deployments may take noticeable time; prefer streaming
or background jobs.

Edge cases:
- Out-of-range pages (negative or >= pageCount) return an empty `ids` array
  while still including pagination metadata so callers can clamp gracefully.
- The index may briefly become inconsistent during concurrent
  create/delete operations; refresh the page to recover.
- Deleted users might linger in the index until the next rebuild. Always
  verify user existence before applying destructive actions.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `page` | `number` | `0` | Zero-based page index. Defaults to `0` (first page). |

## Returns

`Promise`\<`object`\>

Object containing `ids`, `page`, `pageCount`, and `total` user count.

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
let page = 0
while (true) {
	const { ids, pageCount } = await listUserIds(page)
	if (!ids.length) break
	await processUsers(ids)
	if (++page >= pageCount) break
}
```

```ts
const { total } = await listUserIds()
if (total === 0) console.log('No users found')
```

```ts
const { ids, pageCount } = await listUserIds(999)
if (ids.length === 0) {
	console.log(`Page out of range. Max page index: ${pageCount - 1}`)
}
```

## See

 - DEFAULT_INDEX_PAGE_SIZE for the default page size.
 - listUsers for fetching full user objects.
 - addUserToIndex for index maintenance.
 - removeUserFromIndex for cleanup logic.
