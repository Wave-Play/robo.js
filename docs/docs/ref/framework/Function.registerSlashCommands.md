# Function: registerSlashCommands()

```ts
function registerSlashCommands(entries, options): Promise<RegisterCommandsResult>
```

Registers slash commands and context menu commands with Discord.

This function allows you to dynamically register your bot's commands at runtime.
It supports both global and guild-specific registration, with built-in rate limit
handling and detailed error reporting.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entries` | [`RegisterSlashCommandsEntries`](Interface.RegisterSlashCommandsEntries.md) | An object containing manifest entries for commands and context menus to register |
| `options` | [`RegisterSlashCommandsOptions`](Interface.RegisterSlashCommandsOptions.md) | Configuration options for registration |

## Returns

`Promise`\<[`RegisterCommandsResult`](Interface.RegisterCommandsResult.md)\>

A structured result object with registration status and details

## Example

```ts
import { getManifest, registerSlashCommands } from 'robo.js'

const manifest = getManifest()

// Register all commands
const result = await registerSlashCommands({
  commands: manifest.commands,
  messageContext: manifest.context.message,
  userContext: manifest.context.user
}, {
  guildIds: ['123456789'], // Optional: register to specific guilds
  force: true // Optional: force clean re-registration
})

// Register only specific commands
const result = await registerSlashCommands({
  commands: {
    ping: manifest.commands.ping,
    help: manifest.commands.help
  }
})
```
