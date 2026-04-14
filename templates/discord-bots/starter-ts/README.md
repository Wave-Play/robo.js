<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Discord Bot - Starter (TS)

Welcome to your fresh **[Robo.js](https://github.com/Wave-Play/robo)** project!

Build, deploy, and maintain your Discord activities with ease. With Robo.js as your guide, you'll experience a seamless, [file-based setup](https://docs.roboplay.dev/docs/basics/overview#the-robojs-file-structure), an [integrated database](https://docs.roboplay.dev/docs/basics/flashcore), [TypeScript support](https://docs.roboplay.dev/docs/advanced/typescript), and a multitude of [plugin-powered skills](https://docs.roboplay.dev/docs/advanced/plugins) to unlock along the way.

_Ready to embark on this adventure?_

## Table of Contents

- [🔗 Quick Links](#quick-links)
- [✨ Getting Started](#✨-getting-started)
- [🛠️ Development](#️development)
- [🔒 Debugging](#debugging)
- [🛠️ Client Configuration](#️client-configuration)
- [🔌 Ecosystem](#ecosystem)
- [🚀 Hosting](#hosting)

## Quick Links

- [📚 **Documentation:** Getting started with Robo.js](https://robojs.dev/discord-bots)
- [✨ **Discord:** Robo - Imagine Magic](https://robojs.dev/discord)

## ✨ Getting Started

Create a project with this template, replacing `<project-name>` with your desired name:

```bash
npx create-robo --template discord-bots/starter-ts --name <project-name>
```

Then navigate into your project directory:

```bash
cd <project-name>
```

Run development mode:

```bash
npm run dev
```

- [🔰 **Beginner Guide:** New to Discord Bots with Robo? Start here!](https://robojs.dev/discord-bots/beginner-guide)
- [🎭 **Run Modes:** Define profiles for your Robo session.](https://robojs.dev/robojs/mode#default-modes)

## Development

Creating a **[Slash Command](https://robojs.dev/discord-bots/commands)** is as easy as creating files.

Let's say you want a new `/hello` command. Just create a file in the `/src/commands` directory named `hello.js` and export a default function that returns something.

```javascript title="/src/commands/hello.js"
export default (interaction) => {
	interaction.reply('Hello World!')
}
```

![Code for a slash command](https://github.com/Wave-Play/robo.js/blob/main/docs/static/readme/slash-command-code.png?raw=true)

Your `/hello` command is now ready to use! **Robo.js** takes care of registration for you.

![Pk using a slash command](https://raw.githubusercontent.com/Wave-Play/robo.js/refs/heads/main/docs/static/readme/slash-command.png)

Ever clicked on an avatar or message and seen an _Apps_ section? Those are **[Context Commands](https://robojs.dev/discord-bots/context-menu)**!

Create a file file in `/src/context/message` named after the command. For example, `Quote.js`.

```javascript title="/src/context/message/Quote.js"
export default (interaction, message) => {
	interaction.reply(`${message.author} said:\n\n> ${message.content}`)
}
```

![Code for a context command](https://github.com/Wave-Play/robo.js/blob/main/docs/static/readme/context-message-code.png?raw=true)

You can do the same for users under `/src/context/user`.

![Quoting a message via context command](https://github.com/Wave-Play/robo.js/blob/main/docs/static/readme/context-message.png?raw=true)

- [📜 **Slash Commands:** Your bot follows best practices by default.](https://robojs.dev/discord-bots/commands)
- [📡 **Events:** Know and respond to everything that happens.](https://robojs.dev/discord-bots/events)
- [🖱️ **Context Commands:** Extend right click and long press behavior.](https://robojs.dev/discord-bots/context-menu)
- [⚡ **Flashcore Database:** Persist data in your Robo with ease.](https://robojs.dev/robojs/flashcore)

## Debugging

**Discord Bots** made with **Robo.js** come with a built-in **[Debugger](https://robojs.dev/discord-bots/debug)**.

Whenever your bot crashes in development mode, the debugger shows an interactive error message - all within **Discord**!

![Built-in debugger showing an error](https://github.com/Wave-Play/robo.js/blob/main/docs/static/readme/debugger.png?raw=true)

You even get `/dev` **[Subcommands](https://robojs.dev/discord-bots/commands#subcommands)** for quick access to logs, system info, and more. Just set your test server's ID as an **environment variable** called `DISCORD_GUILD_ID`.

- [🐛 **Debugging:** Troubleshoot right within Discord.](https://robojs.dev/discord-bots/debug)
- [🔑 **Credentials:** Secure your Discord Bot credentials.](https://robojs.dev/discord-bots/credentials#optional-variables)

## Client Configuration

**Robo.js** manages your **Discord.js** `Client` instance via the `@robojs/discordjs` plugin. You can call `getClient()` anywhere in your project.

```javascript
// File: /src/commands/name.js
import { getClient } from '@robojs/discordjs'

export default () => {
	return `My name is ${getClient()?.user?.username}`
}
```

Intents or other configurations can be set in the `config/plugins/robojs/discordjs.mjs` file.

```javascript
// File: /config/plugins/robojs/discordjs.mjs
export default {
	clientOptions: {
		intents: ['Guilds', 'GuildMessages']
	}
	// ... other options
}
```

- [🔧 **Configuration:** Customize behavior and features.](https://robojs.dev/robojs/config)

## Robo Ecosystem

By building with **Robo.js**, you gain access to a growing ecosystem of **[plugins](https://robojs.dev/plugins/directory)**, **[templates](https://robojs.dev/templates/overview)**, and **[tools](https://robojs.dev/cli/overview)**. **[Robo Plugins](https://robojs.dev/plugins/overview)** are special. They can add features with one command.

```bash
npx robo add @robojs/ai @robojs/moderation
```

Plugins integrate seamlessly thanks to the **[Robo File Structure](https://robojs.dev/discord-bots/file-structure)**. What's more, anyone can **[create a plugin](https://robojs.dev/plugins/create)**.

- [🔌 **Robo Plugins:** Add features to your Robo seamlessly.](https://robojs.dev/plugins/install)
- [🔌 **Creating Plugins:** Make your own plugins for Robo.js.](https://robojs.dev/plugins/create)
- [🗃️ **Plugin Directory:** Browse plugins for your Robo.](https://robojs.dev/plugins/create)
- [🔗 **Templates:** Kickstart your project with a template.](https://robojs.dev/plugins/create)

## Hosting

**Hosting** your project keeps it running 24/7. No need to keep your computer on at all times, or worry about your Internet connection.

You can host on any platform that supports **Node.js**, or run [`robo deploy`](https://robojs.dev/cli/robo#distributing) to host on **[RoboPlay](https://roboplay.dev)** - a hosting platform optimized for **Robo.js**.

```bash
npm run deploy
```

- [🚀 **RoboPlay:** Deploy with as little as one command.](https://robojs.dev/hosting/roboplay)
- [🛠️ **Self-Hosting:** Learn how to host and maintain it yourself.](https://robojs.dev/hosting/overview)
