# Variable: Selects

```ts
const Selects: object;
```

Select menu component IDs used in interactive messages.

Each select menu ID is prefixed with the namespace to ensure uniqueness
across all plugins and prevent conflicts with other components.

## Type declaration

### AuthorizedCreatorRoles

```ts
readonly AuthorizedCreatorRoles: object;
```

Role select menu for choosing which roles can create roadmap cards.

Used in the setup command to allow administrators to grant card creation
permissions to specific roles beyond just administrators. Users with any
of the selected roles will be able to use the `/roadmap add` command.

### AuthorizedCreatorRoles.id

```ts
readonly id: string;
```

## Example

```ts
import { RoleSelectMenuBuilder } from 'discord.js';
import { Selects } from './constants.js';

// Create a role select menu
const select = new RoleSelectMenuBuilder()
  .setCustomId(Selects.AuthorizedCreatorRoles.id)
  .setPlaceholder('Select roles')
  .setMinValues(0)
  .setMaxValues(10);
```
