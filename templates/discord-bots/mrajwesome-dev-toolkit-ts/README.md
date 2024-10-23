<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# Dev Toolkit (TS)

All new and now optimized for **[Robo.js](https://robojs.dev)**, this package is built to last and comes with everything a starting developer could need, how awesome is that?

- [📚 **Documentation:** Getting started](https://robojs.dev/discord-bots)
- [🚀 **Discord:** MrJAwesome's Coding Lounge](https://discord.gg/codinglounge)
- [🚀 **Discord:** Robo - Imagine Magic](https://robojs.dev/discord)

## Running

Run development mode with:

```bash
npm run dev
```

Your Robo refreshes with every change.

## Developing 🏗️

Create new slash commands by making a new file under the `/src/commands` directory with an exported default function. The file's name becomes the command's name. You can either use the `interaction` parameter or return the result to let Sage handle it for you. For more info on commands, see the **[Discord.js Documentation](https://discord.js.org/#/docs/main/stable/general/welcome)**.

Commands will be automatically registered with Discord when needed, but you can force it by running `npx robo build -f`.

To listen to new events, create a file named after the event in `/src/events`. For example, `typingStart.js` will notify you when someone starts typing. You can stack multiple files for the same event by making a directory named after the event. Files inside it can be named whatever you want. For example:

```
- src
  - events
    - typingStart
      - your-file.js
      - another.js
```

- [📚 **Documentation:** Slash commands](https://robojs.dev/discord-bots/commands)
- [📚 **Documentation:** Events](https://robojs.dev/discord-bots/events)
- [📚 **Documentation:** Context Menus](https://robojs.dev/discord-bots/context-menu)

## Debugging 🐞

Got bugs? No biggie! Robo.js has your back with nifty built-in debugging magic. During dev mode, Robo will provide you with error information, stack traces, interactive logs, and even a sneak peek at the exact code that caused the issue!

To get started, set up a personal Discord server for your Robo to hang out in and add your server's ID as a `DISCORD_GUILD_ID` env variable. Doing this unlocks the fab debugging features, plus the super-handy `/dev` command that gives you quick access to logs, system info, and more.

- [📚 **Documentation:** Debugging](https://robojs.dev/discord-bots/debug)

## Configuration ⚙️

Robo.js automatically handles creating your Discord.js `Client` instance, but you can still configure what gets passed to it using the `config/robo.mjs` file. Use it to add more intents or change the behavior of other Robo.js features such as Sage.

The `.env` file contains your `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Keep these secret. You can get these values from the **[Discord Developer Portal](https://discord.com/developers/applications)**.

- [**Discord Developer Portal:** Manage your Discord Bot](https://discord.com/developers/applications)
- [📚 **Documentation:** Credentials](https://robojs.dev/discord-bots/credentials)

## Plugins 🔌

This Robo boasts an intuitive plugin system that grants new capabilities instantly!

```bash
npx robo add @robojs/ai
```

> Swap out [`@robojs/ai`](https://robojs.dev/plugins/ai) with your chosen plugin's package name

With that, your Robo automatically equips itself with all the features the plugin offers. Want to revert? Simply use [`robo remove`](https://robojs.dev/cli/robo#plugins) to uninstall any plugin.

Crafting something unique in your Robo project? You can turn your innovations into plugins, be it specific functionalities or your entire Robo. Share your genius with the world!

- [📚 **Documentation:** Installing plugins](https://robojs.dev/plugins/install)
- [📚 **Documentation:** Creating plugins](https://robojs.dev/plugins/create)

## Deployment 🚀

Run the `deploy` command to automatically deploy to **[RoboPlay](https://roboplay.dev)** once you're ready to keep your robo online 24/7.

```bash
npm run deploy
```

- [🚀 **RoboPlay:** Hosting your Robo](https://robojs.dev/hosting/overview)

You can also self-host your robo anywhere that supports Node. Just make sure to run `build` followed by `start`:

```bash
npm run build
npm start
```

You can also run `invite` (beta) to automatically generate a server invite to test it yourself or show it off! You can also use the **[Discord Developer Portal](https://discord.com/developers/applications)** to generate an invite as usual.

```bash
npm run invite
```

Happy coding! 🎉
