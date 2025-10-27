# Variable: Buttons

```ts
const Buttons: object;
```

Button component IDs used in interactive messages.

Each button ID is prefixed with the namespace to ensure uniqueness
across all plugins and prevent conflicts with other components.

## Type declaration

### TogglePublic

```ts
readonly TogglePublic: object;
```

Button to toggle between public (read-only) and private (admin/mod only) forum access.

When clicked, this button triggers permission updates on the forum channel:
- Private mode: Only administrators and moderators can view the forum
- Public mode: Everyone can view and read, but only admins/mods can post

### TogglePublic.id

```ts
readonly id: string;
```

## Example

```ts
import { ButtonBuilder, ButtonStyle } from 'discord.js';
import { Buttons } from './constants.js';

// Create a toggle public button
const button = new ButtonBuilder()
  .setCustomId(Buttons.TogglePublic.id)
  .setLabel('Toggle Public Access')
  .setStyle(ButtonStyle.Primary);
```
