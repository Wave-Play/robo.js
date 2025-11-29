# Function: addThreadToHistory()

```ts
function addThreadToHistory(
   guildId, 
   cardId, 
   entry): void
```

Appends a new thread entry to a card's history.

This helper is called when a thread is moved to a new forum (Phase 2).
It records the old thread's metadata including message count for future
reference and linking. Multiple entries can exist for cards that move
through multiple columns over time.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `cardId` | `string` | The provider card ID (e.g., "PROJ-123") |
| `entry` | `ThreadHistoryEntry` | The thread history entry to add |

## Returns

`void`

## Example

```ts
// When moving a thread from "In Progress" to "Done"
const thread = await forum.client.channels.fetch(existingThreadId);
if (thread && thread.isThread()) {
  await addThreadToHistory(guildId, card.id, {
    threadId: thread.id,
    column: 'In Progress',
    forumId: thread.parentId,
    movedAt: Date.now(),
    messageCount: thread.messageCount
  });
}
```
