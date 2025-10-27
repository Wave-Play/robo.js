# Function: getAuthorizedCreatorRoles()

```ts
function getAuthorizedCreatorRoles(guildId): string[]
```

Retrieves the list of role IDs authorized to create roadmap cards.

This helper extracts the authorized creator roles from the guild's settings.
If no roles are configured, an empty array is returned, meaning only
administrators can create cards.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |

## Returns

`string`[]

Array of role IDs that can create cards

## Example

```ts
const authorizedRoles = getAuthorizedCreatorRoles(guildId);
if (authorizedRoles.length > 0) {
  console.log('Roles that can create cards:', authorizedRoles);
} else {
  console.log('Only admins can create cards');
}
```
