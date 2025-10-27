# Function: getAllForumChannels()

```ts
function getAllForumChannels(guild): Promise<Map<string, ForumChannel>>
```

Retrieves all forum channels for a guild, mapped by column name.

This is a helper function for operations that need to work with all forums.
It returns an empty map if no forums are configured.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guild` | `Guild` | The Discord guild |

## Returns

`Promise`\<`Map`\<`string`, `ForumChannel`\>\>

Map of column names to forum channels

## Example

```ts
const forums = await getAllForumChannels(guild);
if (forums.size === 0) {
  return interaction.reply('No roadmap forums configured. Run /roadmap setup first.');
}

// Proceed with sync across all forums
for (const [columnName, forum] of forums.entries()) {
  console.log(`Processing ${columnName} forum`);
}
```
