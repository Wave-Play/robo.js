# Function: isForumPublic()

```ts
function isForumPublic(guildId): boolean
```

Checks if the forum is configured as public.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID. |

## Returns

`boolean`

True if the forum is public, false otherwise

## Example

```ts
if (isForumPublic(guildId)) {
  console.log('Forum is publicly accessible');
} else {
  console.log('Forum is private (admin/mod only)');
}
```
