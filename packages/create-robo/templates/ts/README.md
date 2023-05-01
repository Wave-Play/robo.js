# Hello Robo

Welcome to your fresh Robo.js project! A Node framework for Discord.js bots, Robo.js handles boilerplate, automates command registration, simplifies Typescript support, and boasts "Sage" for easy interactions. Empowered by a dynamic plugin system, your robo thrives on RoboPlay or any Node-supporting host.

Let's get started on your journey to create the perfect Discord bot!

## Running 🏃‍♂️

To run your robo, simply use the `robo dev` command like so:

```bash
npm run dev
```

No need to re-run when you make changes. Your robo will automatically restart! 🔄

Ready to deploy and keep your robo online at all times? Check out the [Deployment](#deployment) section.

## Building 🏗️

Create new slash commands by making a new file under the `/src/commands` directory with an exported default function. The file's name becomes the command's name. You can either use the `interaction` parameter or return the result to let Sage handle it for you. For more info on commands, see the [Discord.js documentation](https://discord.js.org/#/docs/main/stable/general/welcome).

Commands will be automatically registered with Discord when needed, but you can force it by running `robo build -f`.

To listen to new events, create a file named after the event in `/src/events`. For example, `typingStart.js` will notify you when someone starts typing. You can stack multiple files for the same event by making a directory named after the event. Files inside it can be named whatever you want. For example:

```
- src
  - events
    - typingStart
      - your-file.js
      - another.js
```

## Configuration ⚙️

Robo.js automatically handles creating your Discord.js `Client` instance, but you can still configure what gets passed to it using the `.config/robo.mjs` file. Use it to add more intents or change the behavior of other Robo.js features such as Sage, default commands, timeouts, and more.

The `.env` file contains your `DISCORD_TOKEN` and `DISCORD_CLIENT_ID`. Keep these secret. You can get these values from the [Discord Developer Portal](https://discord.com/developers/applications).

## Plugins 🔌

Robo.js has a powerful plugin system. Install plugins as NPM packages like this:

```bash
npm install @roboplay/plugin-gpt
```

Replace `@roboplay/plugin-gpt` with the plugin's package name. You can also turn your existing robo into a plugin using `robo build plugin` and uploading it to NPM via `npm publish`. Just be careful and make sure you're not including sensitive data such as your `.env` file.

## Deployment 🚀

Run the `robo deploy` command to automatically deploy to RoboPlay for free once you're ready to keep your robo online 24/7. You can also self-host your robo anywhere that supports Node. Just make sure to run the `robo build` command followed by `robo start`.

You can also run `robo invite` (beta) to automatically generate a server invite to test it yourself or show it off! You can also use the [Discord Developer Portal](https://discord.com/developers/applications) to generate an invite.

Happy coding! 🎉
