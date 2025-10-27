# Function: setAuthorizedCreatorRoles()

```ts
function setAuthorizedCreatorRoles(guildId, roleIds): void
```

Sets the list of role IDs authorized to create roadmap cards.

This helper updates the authorized creator roles setting. Pass an empty
array to restrict card creation to administrators only.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `roleIds` | `string`[] | Array of role IDs to authorize |

## Returns

`void`

## Example

```ts
// Authorize specific roles
setAuthorizedCreatorRoles(guildId, ['1234567890123456789', '9876543210987654321']);

// Restrict to admins only
setAuthorizedCreatorRoles(guildId, []);
```
