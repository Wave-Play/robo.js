# Function: moveThreadToNewForum()

```ts
function moveThreadToNewForum(
   card, 
   existingThread, 
   targetForum, 
   appliedTags, 
guildId): Promise<ThreadChannel>
```

Moves a roadmap card's discussion thread to a new forum when the column changes.

Creates a replacement thread in the destination forum, optionally links to the previous
discussion when meaningful user activity exists, locks/archives the old thread, updates
synced post mappings, and records a thread history entry.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `card` | [`RoadmapCard`](TypeAlias.RoadmapCard.md) | The roadmap card associated with the thread. |
| `existingThread` | `ThreadChannel`\<`boolean`\> | The thread that needs to be moved. |
| `targetForum` | `ForumChannel` | The destination forum channel. |
| `appliedTags` | `string`[] | Tag IDs to apply to the new thread. |
| `guildId` | `string` | Guild ID for settings persistence. |

## Returns

`Promise`\<`ThreadChannel`\>

The newly created thread in the destination forum.

## Throws

If required Discord references are missing or thread creation fails.

## Example

```ts
await moveThreadToNewForum(card, oldThread, newForum, appliedTags, guildId)
```
