# Function: getCurrentThreadInfo()

```ts
function getCurrentThreadInfo(
   guildId, 
   cardId, 
   threadParentId): object | null
```

Retrieves the current thread ID and its column information for a card.

This helper determines which column a card's current thread belongs to by
looking up the thread's parent forum ID in the forumChannels mapping. This
is used during sync to detect when a card has moved to a different column.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `cardId` | `string` | The provider card ID (e.g., "PROJ-123") |
| `threadParentId` | `string` | The thread's parent forum channel ID |

## Returns

`object` \| `null`

Object with threadId and column, or null if no thread exists or column cannot be determined

## Example

```ts
const thread = await forum.client.channels.fetch(existingThreadId);
if (thread && thread.isThread()) {
  const currentInfo = getCurrentThreadInfo(guildId, card.id, thread.parentId);
  if (currentInfo && card.column !== currentInfo.column) {
    console.log('Column has changed!');
  }
}
```
