# Function: getThreadForColumn()

```ts
function getThreadForColumn(
   guildId, 
   cardId, 
   targetColumn): ThreadHistoryEntry | null
```

Retrieves the most recent thread entry for a specific column.

This helper filters the thread history for a card to find entries matching
the target column name, then returns the most recent one based on the
`movedAt` timestamp. This is used by the sync engine to detect when cards
move back to previously visited columns, enabling thread reuse to prevent
duplicate threads.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `cardId` | `string` | The provider card ID (e.g., "PROJ-123") |
| `targetColumn` | `string` | The column name to search for (e.g., "Backlog") |

## Returns

`ThreadHistoryEntry` \| `null`

The most recent thread history entry for the target column, or null if no matching entries exist

## Example

```ts
// Check if card has been in Backlog before
const previousBacklogThread = getThreadForColumn(guildId, 'PROJ-123', 'Backlog');
if (previousBacklogThread) {
  // Reuse the existing thread instead of creating a new one
  console.log(`Found previous thread: ${previousBacklogThread.threadId}`);
} else {
  // Create a new thread for this column
  console.log('No previous thread found, creating new one');
}
```
