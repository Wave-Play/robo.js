# Overview 🚀

Next-gen bot development is all about organization, and that's where Robo.js shines! 🌟

If you're familiar with Next.js, you'll feel right at home. If not, no worries—Robo.js keeps things simple. All you need to know is how to arrange your files. And that's it. Seriously!

## The Robo.js File Structure 📂

To start with, you'll need a `src` directory at the root with `commands` and `events` directories inside. The command file's name becomes the command name, and the event file's name turns into the triggering event's name. 

Here's a basic example of a Robo.js file structure:

```
src/
├── commands/
│   └── ping.js
└── events/
    └── messageCreate.js
```

Want to go a step further? No problem! You can nest files to create subcommands and grouped events.

```
src/
├── commands/
│   ├── ping.js
│   ├── ban/
│   │   └── user.js
│   └── settings/
│       └── update/
│           └── something.js
└── events/
    ├── ready.js
    └── messageCreate/
        └── dm.js
        └── hello.js
```

## Modular Magic 📦

For larger Robo projects, modules are your best friends! They allow you to group the same folder structure within modular subfolders. Think of it like having mini Robo projects within your main project. The names of the folders inside "modules/" can be anything you want, as long as what's inside follows the Robo file structure.

```
src/
└── modules/
    ├── moderation/
    │   ├── commands/
    │   └── events/
    └── fun/
        ├── commands/
        └── events/
```

For a deeper dive into the world of modules, check out the [modules documentation](./modules.md).

## Creating Commands 📜

Commands in Robo.js are super straightforward. Just create a file in the `commands` directory, and the name of the file becomes the name of the command. Easy peasy, right? It's a cinch to create robust slash commands, and Robo.js takes care of registering them for you. You can even nest commands for those extra spicy subcommands! 🌶️

Here's how your command file structure might look:

```
/src
  /commands
    ping.js
```

And the ping.js file could be as simple as:

```javascript
export default () => {
	return 'Pong!'
}
```

To learn more about commands and their full potential, head over to the [commands documentation](./commands.md).

## Listening to Events 📡

Just like commands, events in Robo.js follow the same naming convention. Create a file in the `events` directory, and the name of the file becomes the Discord event you're listening to. But wait, there's more! Events can be stacked for even more control over your bot's responses. 🤖

Here's a quick peek at your event file structure:

```
/src
  /events
    messageCreate.js
```

And the messageCreate.js file could be:

```javascript
export default (message) => {
    if (message.content.includes('hello')) {
        message.channel.send('Hello there!')
    }
}
```

To dive deeper into events, check out the [events documentation](./events.md).

## Sage Mode 🔮

Meet Sage, your new best friend in interaction handling. Sage operates behind the scenes, automatically simplifying interaction handling and providing smart error replies that make debugging a breeze. With Sage, you can focus on what you do best: creating epic bot interactions! ✨

Unlock the full power of Sage Mode by visiting the [Sage documentation](./sage.md).
