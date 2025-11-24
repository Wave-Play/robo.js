# Function: getThreadHistory()

```ts
function getThreadHistory(guildId, cardId): ThreadHistoryEntry[]
```

Retrieves the thread history array for a specific card.

This helper returns all historical thread entries for a card that has
moved between columns. Each entry contains the thread ID, column name,
forum ID, timestamp, and message count at the time of the move.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `cardId` | `string` | The provider card ID (e.g., "PROJ-123") |

## Returns

`ThreadHistoryEntry`[]

Array of thread history entries, empty array if no history exists

## Example

```ts
const history = getThreadHistory(guildId, 'PROJ-123');
if (history.length > 0) {
  const lastThread = history[history.length - 1];
  console.log(`Previous thread in ${lastThread.column}: ${lastThread.messageCount} messages`);
}
```
