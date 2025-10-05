# Function: listUserIds()

```ts
function listUserIds(page): Promise<object>
```

Returns a paginated list of Auth.js user identifiers stored in Flashcore.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `page` | `number` | `0` | Zero-based page index; defaults to the first page. |

## Returns

`Promise`\<`object`\>

Summary object containing IDs plus paging metadata.

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
const { ids } = await listUserIds()
```

```ts
const page = await listUserIds(1)
console.log(page.total)
```
