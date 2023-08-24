# Commands 📜

Slash commands have changed the game in Discord, making it a breeze for users to interact with bots (or as we like to call them, Robos). And with Robo.js, weaving your own slash commands is as easy as pie. Let's unravel this together!

## Crafting Simple Commands 🛠️

Start off with a simple command. Create a file in the `commands` directory. The file name? That's your command! 

For instance, to create a `/ping` command, your file structure would look like this:

```plaintext
src/
└── commands/
    └── ping.js
```

And inside your `ping.js`? Straightforward:

```javascript
export default () => {
  return 'Pong!'
}
```

To use the interaction object directly:

```javascript
export default (interaction) => {
  interaction.reply('Pong!')
}
```
In this case, Sage steps back, letting you handle the interaction directly.

## Subcommands and Subcommand Groups 📚

Creating subcommands with Robo.js is as simple as creating new files in a folder. The folder name becomes the parent command, and the file names become the subcommands. But remember, you can't have a parent command file and subcommand files together.

```plaintext
src/
└── commands/
    └── ban/
        └── user.js
```

And subcommand groups? It's the same concept, but one level deeper. Again, parent commands or subcommands can't live alongside subcommand groups.

```plaintext
src/
└── commands/
    └── settings/
        └── update/
            └── something.js
```

## Customizing Commands 🖋️

Give your commands some context with descriptions. You can do this by exporting a `config` object from your command file.

```javascript
export const config = {
  description: 'Responds with Pong!'
}
```

For TypeScript users, you can add typings for both the `config` object and the command result.

```typescript
import type { CommandConfig, CommandResult } from '@roboplay/robo.js'

export const config: CommandConfig = {
  description: 'Responds with Pong!'
}

export default (): CommandResult => {
  return 'Pong!'
}
```

The `config` object also lets you customize stuff like locale translations, Sage options, and command timeouts. To understand more about the available configuration options, check out the [configuration section](./config.md).

## Command Options 🎚️

Robo.js allows you to further customize your commands with options. You can define these options in your `config` object and then access their values in your command function.

```javascript
export const config = {
  description: 'Responds with Pong!',
  options: [
    {
      name: 'loud',
      description: 'Respond loudly?',
      type: 'boolean'
    }
  ]
}

export default (interaction) => {
  const loud = interaction.options.get('loud')?.value as boolean
  return loud ? 'PONG!!!' : 'Pong!'
}
```
Want to explore more options? Check the [configuration section](./config.md).

## Autocomplete 🧠

Autocomplete can take your commands to the next level by providing suggestions as users type. You can implement autocomplete by exporting an `autocomplete` function in your command file.

```javascript
export const config = {
  description: 'Chooses a color',
  options: [
    {
      name: 'color',
      description: 'Your favorite color',
      type: 'string',
      autocomplete: true
    }
  ]
}

const colors = ['red', 'green', 'blue', 'yellow', 'black', 'white', 'pink', 'purple', 'brown']

export const autocomplete = (interaction) => {
  const colorQuery = interaction.options.get("color")?.value as string;
  const filtered = colors.filter((color) => color.startsWith(colorQuery));
  return interaction.respond(filtered.map((colors) => ({ name: colors, value: colors })));
};

export default (interaction) => {
  return `You chose ${interaction.options.get('color')?.value}`
}
```

In this example, the `autocomplete` function returns an array of colors that start with the user's input, providing a dynamic and responsive user experience.

Note: the type of the Interaction is: `AutocompleteInteraction`

## Command Registration 📝

The cherry on top? You don't need to manually register your commands. Robo.js handles it for you when you run `robo dev` or `robo build`, automatically! However, if things go sideways for some reason, you can use the `--force` flag to force registration.

```plaintext
robo build --force
```

And voila! Crafting commands with Robo.js is a cinch. So what are you waiting for? Give it a whirl and watch your Robo come alive!
