# Function: updateForumTagsForColumn()

```ts
function updateForumTagsForColumn(
   guild, 
   columnName, 
tagNames): Promise<void>
```

Updates forum tags for a column by merging new tags with existing ones (max 20 tags).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guild` | `Guild` | Discord guild. |
| `columnName` | `string` | Column name (e.g., 'Backlog'). |
| `tagNames` | `string`[] | Tag names to add. |

## Returns

`Promise`\<`void`\>

## Example

```ts
await updateForumTagsForColumn(guild, 'Backlog', ['Feature', 'Bug']);
```
