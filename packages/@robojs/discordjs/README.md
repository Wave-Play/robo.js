# @robojs/discordjs

Discord.js integration for Robo.js. This plugin owns the Discord client lifecycle and adds file-based routes for slash commands, prefix commands, context menus, gateway events, and middleware.

## Install

```bash
npx robo add @robojs/discordjs
```

Set the required Discord credentials:

```bash
DISCORD_TOKEN="your-bot-token"
DISCORD_CLIENT_ID="your-client-id"
```

Configure the Discord.js client in `config/plugins/robojs/discordjs.ts`:

```ts
import type { DiscordConfig } from '@robojs/discordjs'

export default {
	clientOptions: {
		intents: ['Guilds', 'GuildMessages']
	}
} satisfies DiscordConfig
```

## Slash Commands

Files in `src/commands/` become Discord slash commands. Nested files map to subcommands with spaces.

```ts
// src/commands/ping.ts
import type { CommandConfig } from '@robojs/discordjs'

export const config: CommandConfig = {
	description: 'Check whether the bot is online'
}

export default () => {
	return 'Pong!'
}
```

## Prefix Commands

Files in `src/prefixCommands/` respond to text commands using the configured prefix. The default prefix is `!`.

```ts
// src/prefixCommands/ping.ts
import type { PrefixCommandConfig } from '@robojs/discordjs'
import type { Message } from 'discord.js'

export const config: PrefixCommandConfig = {
	description: 'Check whether the bot is online',
	aliases: ['p']
}

export default (message: Message) => {
	return 'Pong!'
}
```

Prefix behavior can be configured from the plugin config:

```ts
import type { DiscordConfig } from '@robojs/discordjs'

export default {
	clientOptions: {
		intents: ['Guilds', 'GuildMessages', 'MessageContent']
	},
	prefix: {
		value: '!',
		mentionAsPrefix: true
	}
} satisfies DiscordConfig
```

## Events

Files in `src/events/` become Discord gateway listeners.

```ts
// src/events/clientReady.ts
import type { Client } from 'discord.js'

export default (client: Client) => {
	console.log(`Ready as ${client.user?.tag}`)
}
```

## Client Access

Use `getClient()` after the plugin has prepared the Discord client:

```ts
import { getClient, hasClient } from '@robojs/discordjs'

if (hasClient()) {
	const client = getClient()
	console.log(client.user?.tag)
}
```

## Public API

Common exports include:

- `getClient()` and `hasClient()` for client access
- `createCommandConfig()` and `createContextConfig()` for typed handler config
- `commands`, `events`, `context`, `middleware`, and `prefixCommands` namespace controllers
- `CommandConfig`, `CommandOptions`, `CommandResult`, `EventConfig`, `MiddlewareData`, `PrefixCommandConfig`, and related types

## Docs

Full documentation: https://robojs.dev/docs/discordjs
