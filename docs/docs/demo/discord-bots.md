## Getting started

Just open up a terminal and run this, where `mybot` is your desired project name:

```bash
npx create-robo mybot
```

It'll ask you to select what kind of features you'd like. You can just keep the defaults enabled by pressing enter, or uncheck TypeScript if you prefer JavaScript. It'll then ask for optional recommended plugins. You can skip that step by pressing enter again. Finally, it'll ask for the bot token and client ID, which you can either enter on the spot or also skip. Once complete, you'll have a new project.

![#](/demo/1.png)
![#](/demo/2.png)
![#](/demo/3.png)
![#](/demo/4.png)
![#](/demo/5.png)
![#](/demo/6.png)

By default, we create a `/ping` command and a `messageCreate` event listener as example code. You can run it with `npm run dev` in the directory.

![#](/demo/7.png)
![#](/demo/8.png)
![#](/demo/9.png)

Command registration is fully automatic, but you can force it in case you have any issues with:

```bash
npx robo build --force
```

Robo.js maintains a manifest that allows it to smartly detect changes and register only when needed. It's also fully compliant with Discord's new entry command.

Everything is still Discord.js, so you can use the interaction and event objects the same way as always.

![#](/demo/10.png)
![#](/demo/11.png)

We do, however, also provide synthetic sugar for commands. You can return directly instead of using `interaction.reply`. If you export an `async` function, it will also automatically defer the interaction if it takes too long.

![#](/demo/12.png)
![#](/demo/13.png)
![#](/demo/14.png)

The `client` object is completely managed by the framework. You can pass options to it in the `/config/robo.mjs` file, with full type safety even if you don't use TypeScript.

You can then import it anywhere in your project.

![#](/demo/15.png)
![#](/demo/16.png)

You can add commands by simply adding files to the `/src/commands` folder. The name of the file becomes the name of the command. That means you can create a slash command with literally one line of code.

You can even create subcommand groups by nesting folders.

![#](/demo/17.png)
![#](/demo/18.png)

The same applies to events. The name of the file is the name of the event you listen to. You can register multiple listeners to the same event by making a folder instead.

![#](/demo/19.png)

If you wanna keep things tidy, you can make a modules folder and nest the same file structure there.

![#](/demo/20.png)

We also have a powerful plugin system. You can instantly add features like moderation slash commands or AI chatbot functionality with our `@robojs/ai` and `@robojs/moderation` plugins. They even work together seamlessly.

Anyone can make their own plugin the exact same way they make bots like I explained above.

![#](/demo/21.png)
![#](/demo/22.png)

We have more plugins than Sapphire. You can add things like analytics, a web server, and even tRPC integration just as easily. Some even come with example code and/or boilerplate.

https://robojs.dev/plugins/directory

![#](/demo/23.png)
![#](/demo/24.png)

It has a built-in KV database called Flashcore. It's file-based by default, but can easily be extended to use anything else, like SQLite and Postgres. Flashcore is fully compatible with all KeyV adapters as well, so there's already a large ecosystem for it. We created this so plugins can have a database without each bundling their own.

Same thing for states, which are more ephemeral but survive restarts.

In dev mode, you will see the exact cause of errors that caused things to crash, alongside logs and stack traces. All within Discord. You can also forward these to a specific channel in production mode.

![#](/demo/25.png)
![#](/demo/26.png)
