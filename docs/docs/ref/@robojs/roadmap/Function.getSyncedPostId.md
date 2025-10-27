# Function: getSyncedPostId()

```ts
function getSyncedPostId(guildId, cardId): string | undefined
```

Retrieves the Discord thread ID for a synced provider card.

This helper looks up the thread ID associated with a specific
external card ID (e.g., a Jira issue key).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `cardId` | `string` | The provider card ID (e.g., "PROJ-123") |

## Returns

`string` \| `undefined`

The Discord thread ID, or undefined if not synced

## Example

```ts
const threadId = getSyncedPostId(guildId, 'PROJ-123');
if (threadId) {
  // Update existing thread
} else {
  // Create new thread
}
```
