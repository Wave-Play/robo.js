# Function: getForumChannelForColumn()

```ts
function getForumChannelForColumn(guild, columnName): Promise<ForumChannel | null>
```

Retrieves a specific forum channel for a column.

This is a helper function for validation before operations on a specific
column's forum. It returns null if no forum is configured for the column
or if the channel was deleted.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guild` | `Guild` | The Discord guild |
| `columnName` | `string` | The column name (e.g., 'Backlog', 'In Progress', 'Done') |

## Returns

`Promise`\<`ForumChannel` \| `null`\>

The forum channel for the column, or null if not found

## Example

```ts
const backlogForum = await getForumChannelForColumn(guild, 'Backlog');
if (!backlogForum) {
  return interaction.reply('No Backlog forum configured. Run /roadmap setup first.');
}
```
