# Function: listUsers()

```ts
function listUsers(page): Promise<object>
```

Reads full Auth.js user records backed by Flashcore.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `page` | `number` | `0` | Zero-based page index; defaults to the first page. |

## Returns

`Promise`\<`object`\>

List of users alongside pagination metadata.

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
const { users } = await listUsers(2)
```

```ts
const { users, pageCount } = await listUsers()
if (pageCount > 1) console.log('paginate')
```
