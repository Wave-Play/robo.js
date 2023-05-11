# Developing Overview

## Commands 🎮

With Robo.js, creating slash commands is a breeze! Simply add a file to the `commands` folder, and its name becomes your slash command. For example, if you want a `/ping` command, create a `ping.js` file inside the `commands` folder. Piece of cake!

## Events 🎉

Events work similarly to commands! Create a file with the same name as the Discord event you want to listen to, and Robo.js will do the rest. For stacked events, use a directory named after the event and toss your event files inside. It's best to name stacked event files based on their purpose, like `dm.js` and `hello.js` under `messageCreate`.

## The Robo.js File Structure 📂

In Robo.js, you'll want a `src` directory at the root with `commands` and `events` directories chillin' inside. The command file's name becomes the command name, and the event file's name transforms into the triggering event's name. Stack commands to whip up subcommands and use a directory with the same name as the event for stacked events.

Here's a little example of a Robo.js file structure for commands and events:

```
src/
├── commands/
│   ├── ping.js
│   ├── settings.js
│   └── settings/
│       └── subcommand.js
└── events/
    ├── ready.js
    └── messageCreate/
        └── dm.js
        └── hello.js
```

## Sage 🧙

Sage Mode simplifies interaction handling and helps debug your bot with smart error replies. Debugging has never been easier! Want to learn more? Check out the [Sage Docs](./sage) for all the juicy details!
