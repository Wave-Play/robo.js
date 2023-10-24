# Migrating to Robo.js 🚀

Robo.js is a rad framework built on top of Discord.js. It's got a simple but powerful file structure, a better development experience, and loads of extra features, all while being 100% compatible with Discord.js code.

## Why Upgrade? 📈

Robo.js spices up Discord.js with some awesome features like:

- Automatic command registration
- Automatic permission management
- Built-in lifecycle events
- Epic Plugins
- And so much more!

## Getting Started

First things first, install the Robo.js package:

```bash
npm install @roboplay/robo.js
```

Next up, choose a migration option based on your existing bot's complexity.

## Option 1: Full-swoop Migration (Simple Bots) 🦅

For simple bots, we recommend diving headfirst into the Robo.js File Structure. You'll get automatic command registration, plugins, and more. Say goodbye to managing the Discord.js client object manually when you migrate your handlers (events/commands) to the Robo.js File Structure. 

1. Migrate your bot to the **[Robo.js File Structure](/docs/basics/overview#the-robojs-file-structure)**.

2. Update your `config/robo.mjs` file with any client options you used with the Discord.js client. For example:
```js
import { Intents } from 'discord.js'

export default {
  clientOptions: {
    intents: [Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS]
  }
}
```

3. Use `robo dev` to run your bot during development.

```bash
npx robo dev
```

## Option 2: Classic Handlers 🎛️

You can use the Robo.js client object to listen to Discord events just like you're used to in Discord.js. 

1. Copy your existing handlers into the `_start.js` file under the `src/events/` directory.

```js
import { client } from '@roboplay/robo.js'

export default () => {
	client.on('messageCreate', (message) => {
		// Your existing message handler logic
	})
}
```

2. Update your `config/robo.mjs` file with any client options you used with the Discord.js client.
```js
import { Intents } from 'discord.js'

export default {
  clientOptions: {
    intents: [Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_MESSAGE_REACTIONS]
  }
}
```

3. Use `robo dev` to run your bot during development.

```bash
npx robo dev
```

By doing this, you'll enjoy most of Robo.js features while gradually migrating your handlers (events/commands) to the **[Robo.js File Structure](/docs/basics/overview#the-robojs-file-structure)**.

> **Note:** Robo.js handles the `client.login()` part for you, so no worries there! 

## Option 3: Slow Migration (Complex Bots) 🚪

For complex bots, think about importing and starting Robo in your existing entry file. This lets you slowly migrate your existing bot to Robo.js.

```js
import { Client } from 'discord.js'
import { Robo } from '@roboplay/robo.js'

const client = new Client()

client.on('messageCreate', (message) => {
  console.log(message.content)
})

Robo.start({ client })
```

With this setup, you can start migrating your existing commands into the [Robo.js File Structure](/docs/basics/overview) or create new ones this way while you work your way there. 

Start by moving your `clientOptions` into a`config/robo.mjs` file instead of creating your own custom client. Once you're done migrating, you can kick off your projects using `robo dev` instead of your own entry file.

```bash
npx robo dev
```

## Why We're All About the Robo.js File Structure 🏗️

We're huge fans of the Robo.js File Structure 'cause it unlocks awesome features like automatic command registration, plugin restarts during development, and a super organized project structure. Sure, you can use Robo.js without going all-in on its file structure, but you'll miss out on some of the perks that make Robo.js a powerhouse for bot development.

Whichever migration path you pick, adopting Robo.js is gonna help you level up your bot development process and give you a more organized, efficient way to manage your bot.

> **By the way...** It's not required, but TypeScript + Linting while you're working with Robo.js can be super handy. Check out the [TypeScript Docs](/docs/advanced/typescript) and [Linting Docs](/docs/advanced/linting) to get started.
