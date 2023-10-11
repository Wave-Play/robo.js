# Hiya, starter-typescript ✨

Welcome to your fresh **[Robo.js](https://github.com/Wave-Play/robo)** project! A Node framework for Discord.js bots, Robo.js handles boilerplate, automates command registration, simplifies Typescript support, and boasts "Sage" for easy interactions. Empowered by a dynamic plugin system, your robo thrives on RoboPlay or any Node-supporting host.

Let's get started on your journey to create the perfect Discord bot!

## Running 🏃‍♂️

To run your Robo, simply use the following command:

```bash
npx robo dev
```

No need to re-run when you make changes. Your Robo will automatically restart! 🔄

Ready to deploy and keep your Robo online at all times? Check out the [Deployment Documentation](<[#deployment](https://github.com/Wave-Play/robo/blob/main/docs/hosting.md)>).

## Developing 🏗️

Create new slash commands by making a new file under the `/src/commands` directory with an exported default function. The file's name becomes the command's name. You can either use the `interaction` parameter or return the result to let Sage handle it for you. For more info on commands, see the [Discord.js Documentation](https://discord.js.org/#/docs/main/stable/general/welcome).

Commands will be automatically registered with Discord when needed, but you can force it by running `npx robo build -f`.

To listen to new events, create a file named after the event in `/src/events`. For example, `typingStart.js` will notify you when someone starts typing. You can stack multiple files for the same event by making a directory named after the event. Files inside it can be named whatever you want. For example:

```
- src
  - events
    - typingStart
      - your-file.js
      - another.js
```

## Debugging 🐞

Got bugs? No biggie! Robo.js has your back with nifty built-in debugging magic. During dev mode, Robo will provide you with error information, stack traces, interactive logs, and even a sneak peek at the exact code that caused the issue!

To get started, set up a personal Discord server for your Robo to hang out in and add your server's ID as a `DISCORD_GUILD_ID` env variable. Doing this unlocks the fab debugging features, plus the super-handy `/dev` command that gives you quick access to logs, system info, and more.

For a more comprehensive guide, take a look at the [Debugging Documentation](https://github.com/Wave-Play/robo/blob/main/docs/advanced/debugging.md). 🕵️‍♀️🔍

## Configuration ⚙️

Robo.js automatically handles creating your Discord.js `Client` instance, but you can still configure what gets passed to it using the `config/robo.mjs` file. Use it to add more intents or change the behavior of other Robo.js features such as Sage, default commands, timeouts, and more.

The `.env` file contains your `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Keep these secret. You can get these values from the [Discord Developer Portal](https://discord.com/developers/applications).

## Plugins 🔌

Robo.js has a powerful plugin system. Install plugins as NPM packages like this:

```bash
npm install @roboplay/plugin-gpt
```

Replace `@roboplay/plugin-gpt` with the plugin's package name. Next, add the plugin to your Robo's configuration file, typically located at `config/robo.mjs`.

You can also turn your existing robo into a plugin using `npx robo build plugin` and uploading it to NPM via `npm publish`. Just be careful and make sure you're not including sensitive data such as your `.env` file.

## Deployment 🚀

Run the `npx robo deploy` command to automatically deploy to **[RoboPlay](https://roboplay.dev)** for free once you're ready to keep your robo online 24/7. You can also self-host your robo anywhere that supports Node. Just make sure to run the `npx robo build` command followed by `npx robo start`.

You can also run `npx robo invite` (beta) to automatically generate a server invite to test it yourself or show it off! You can also use the [Discord Developer Portal](https://discord.com/developers/applications) to generate an invite as usual.

Happy coding! 🎉
