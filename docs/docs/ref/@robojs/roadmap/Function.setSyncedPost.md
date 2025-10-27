# Function: setSyncedPost()

```ts
function setSyncedPost(
   guildId, 
   cardId, 
   threadId): void
```

Records a synced post mapping between a provider card and Discord thread.

This helper updates just the synced posts mapping without affecting
other settings. It's used after successfully creating or updating a
forum post to track the relationship.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `cardId` | `string` | The provider card ID (e.g., "PROJ-123") |
| `threadId` | `string` | The Discord thread ID |

## Returns

`void`

## Example

```ts
// After creating a forum post
const thread = await forumChannel.threads.create({...});
setSyncedPost(guildId, jiraIssue.key, thread.id);
```
