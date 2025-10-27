# Function: canUserCreateCards()

```ts
function canUserCreateCards(
   guildId, 
   userRoleIds, 
   isAdmin): boolean
```

Checks if a user is authorized to create roadmap cards.

A user is authorized if they are an administrator OR if they have any role
that is in the authorized creator roles list. Administrators are always
authorized regardless of the role configuration.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `guildId` | `string` | The Discord guild ID |
| `userRoleIds` | `string`[] | Array of role IDs the user has |
| `isAdmin` | `boolean` | Whether the user is an administrator |

## Returns

`boolean`

True if the user can create cards, false otherwise

## Example

```ts
const member = interaction.member;
const isAdmin = member.permissions.has(PermissionFlagsBits.Administrator);
const userRoles = member.roles.cache.map(r => r.id);

if (canUserCreateCards(guildId, userRoles, isAdmin)) {
  // Allow card creation
} else {
  // Deny access
}
```
