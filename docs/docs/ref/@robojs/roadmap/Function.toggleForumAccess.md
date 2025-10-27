# Function: toggleForumAccess()

```ts
function toggleForumAccess(guild, mode): Promise<void>
```

Toggles roadmap category between private (admin/mod only) and public (everyone can view/comment).

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guild` | `Guild` | Discord guild. |
| `mode` | [`ForumPermissionMode`](TypeAlias.ForumPermissionMode.md) | 'private' or 'public'. |

## Returns

`Promise`\<`void`\>

## Throws

Error if category not configured or bot lacks permissions.

## Example

```ts
await toggleForumAccess(guild, 'public');
```
