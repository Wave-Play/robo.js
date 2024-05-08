import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Overview

Robo.js makes building Discord.js bots as easy as putting certain files in the right place. Want to create a command? Just make a file in the `/src/commands` directory. Events? Create files in `/src/events`. It's that simple!

Continue reading below for a quick overview of files specific to Discord bots.

:::tip Robo.js does *not* replace Discord.js!

Instead, it simplifies the process of building Discord bots by taking care of boilerplate code. You still have access to the full Discord.js API and existing code is still compatible!

**Got an existing bot?** Check out the **[Migration Guide](./migrate)** for how to upgrade to Robo.js.

:::

## File Structure

Discord bots built with Robo.js follow the following file structure:

- `/src/commands`: Slash commands. Can be nested for subcommands or subcommand groups.
- `/src/context`: Context commands for either `/user` or `/message`.
- `/src/events`: Discord events. Can be nested for grouped events.

### Basic Example

```
/src
├── /commands
│   └── ping.js
└── /events
    └── messageCreate.js
```

The above is used to create:

- `/ping` command.
- `messageCreate` event.

### Advanced Example

```
/src
├── /commands
│   ├── ping.js
│   ├── /ban
│   │   └── user.js
│   └── /settings
│       └── /update
│           └── something.js
├── /context
│   ├── /user
│   │   └── Audit.js
│   └── /message
│       └── Report.js
└── /events
    ├── ready.js
    └── /messageCreate
        ├── dm.js
        └── hello.js
```

The above is used to create:

- `/ping` command.
- `/ban user` subcommand.
- `/settings update something` subcommand group.
- `Audit` user context command.
- `Report` message context command.
- `ready` event.
- `dm` and `hello` grouped `messageCreate` events.

:::tip

Check out the **[Robo.js File Structure](../robojs/files)** to learn more about Robo's standard files.

:::

### Modules

For larger projects, you can use modules to group similar functionality together as if they were mini-projects within your main project. Each module follows the same file structure.

See **[Modules](../robojs/modules)** for more information.

## Slash Commands

Slash commands in Robo.js are straightforward. Just create a file in the `commands` directory, and the name of the file becomes the name of the command. Easy peasy, right? You can even nest commands for those extra spicy subcommands!

### Example Usage

Creating a command is as easy as exporting a default function from a file in the `/src/commands` directory.

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript title="/src/commands/ping.js"
export default () => {
	return 'Pong!'
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/commands/ping.ts"
import type { CommandConfig } from 'robo.js'

export default (): CommandResult => {
	return 'Pong!'
}
```

</TabItem>
</Tabs>

To learn more about commands and their full potential, head over to the **[Commands Section](./commands)**.

### Registration

It's automatic! Robo.js will register command changes for you whenever you `build` or `dev` your project. So just sit back, relax, and code away!

If you run into any issues or don't see your changes, you can always run `build` with the `--force` flag. This will force Robo.js to clean up and re-register all commands.

## Context Commands

Ever right clicked on someone's profile or a message and seen an "Apps" section? Those are context commands!

Creating and registering context commands in Robo.js is no different from regular commands. The `/context` directory can have two subdirectories: `/user` and `/message`. Just like commands, the name of the file becomes the name of the context command.

## Event Listeners

Listening to events using Robo.js again follows the same file structure. Create a file in the `events` directory, and the name of the file becomes the Discord event you're listening to. Noticing a pattern here?

### Example Usage

Registering an event listener is as simple as creating a file in the `/src/events` directory.

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/events/messageCreate.js"
export default (message) => {
	if (message.content.includes('hello')) {
		message.channel.send('Hello there!')
	}
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/events/messageCreate.ts"
import type { Message } from 'discord.js'

export default (message: Message) => {
	if (message.content.includes('hello')) {
		message.channel.send('Hello there!')
	}
}
```

</TabItem>
</Tabs>

Your default export is the equivalent of `client.on('messageCreate', (message) => {})` in Discord.js. The same exact parameters are passed to your event listener function.

To dive deeper into events, check out the **[Events Section](./events)**.

## Sage Mode

Meet Sage, your new best friend in interaction handling. Sage operates behind the scenes, automatically simplifying interaction handling and providing smart error replies that make debugging a breeze. With Sage, you can focus on what you do best: creating epic bot interactions! ✨

Unlock the full power of Sage Mode by visiting the **[Sage Section](./sage)**.
