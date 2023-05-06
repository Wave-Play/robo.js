# Getting Started

Dive into the world of Robo.js, where developing Discord bots is more fun, easier, and seamlessly integrates with plugins. 🎉

## Quickstart 🚀

The easiest way to get started with Robo.js is to use the interactive CLI. Run the following command in your terminal:

```bash
npx create-robo <projectName>
```

This command guides you through setting up a project tailored to your preferences, including TypeScript, linting, styling, and plugins.

> Note: Don't forget to replace `<projectName>` with the desired name for your new Robo project.

## Upgrading Existing Project ⏫

If you prefer to create a project from scratch or slowly transition an existing bot to use Robo.js, follow these steps.

#### Install Required Packages 📦

Install the `@roboplay/robo.js` package alongside `discord.js`. Robo.js complements Discord.js as a framework built around it.

```
npm install @roboplay/robo.js discord.js
```

#### Configure TypeScript, ESLint, and Prettier (optional) 🔧

For TypeScript support, install the following dev dependencies: `@swc/core` and `typescript`.

```
npm install --save-dev @swc/core typescript
```

Create a `tsconfig.json` file to configure your TypeScript settings. Robo.js uses these dependencies to compile your source files. For ESLint or Prettier, install and configure them separately. [Check out their documentation for details](https://eslint.org/docs/user-guide/getting-started).

#### Adopt the Robo.js File Structure 📂

Upgrade to Robo.js by following the standard Robo file structure. This includes a `src` directory at the root containing `commands` and `events` directories. The command file's name becomes the command name, and the event file's name becomes the triggering event's name. Stack commands to create subcommands and use a directory with the same name as the event for stacked events.

Here's an example of a Robo.js file structure for commands and events:

```
src/
├── commands/
│   ├── ping.js
│   └── group/
│       └── subcommand.js
└── events/
    ├── ready.js
    └── messageCreate/
        └── example.js
        └── another-example.js
```

Check out the [Commands](./commands.md) and [Events](./events.md) documentation for more info.

#### Use Robo.js CLI Commands ⌨️

Update your existing project to use Robo.js' built-in CLI commands. The `robo dev` command runs your project while listening for code changes and restarting automatically. Unlike other common methods, Robo.js ensures proper handling of lifecycle events to prevent common bot bugs. Deploy your bot to a host by running `robo build` to compile your code and `robo start` to start it in production mode. Peek at the [Command Line Interface](./cli.md) documentation for more details.

#### Command Updates Made Easy 🎯

No need to use your own script to register command updates with Robo.js—it takes care of that for ya!

## Discord Developer Portal 🌐

Follow these steps to register your Discord app, add a bot, and find the Client ID and Discord Bot token:

1. Visit the [Discord Developer Portal](https://discord.com/developers/applications) and sign in with your Discord account.
2. Click "New Application" and enter a name for your app.
3. Head to the "Bot" tab and click "Add Bot" to create a bot for your app.
4. In the "Bot" tab, find your bot's token and click "Copy."
5. In the "General Information" tab, find the Client ID and copy it as well.

Remember to keep the Client ID and Discord Bot token safe in your `.env` file.

## Troubleshooting 🛠️

If you run into issues, execute `robo doctor` to automatically detect common problems and offer fixes. This command can also identify issues with Robo.js plugins. Check out the [Debugging](./debugging.md) docs and feel free to ask the Sage bot for help.

> Note: You can summon Sage in the documentation site at any time by pressing Command + K or Control + K.

## Next Steps 🧭

Now that you're all set up, explore these sections to level up your Robo.js skills:

1. [Developing your Robo](./developing.md) - Learn how to develop your Robo, create commands and events, and interact with the Discord API.
2. [Creating Plugins](./plugins.md) - Discover how to create plugins that extend the functionality of Robo.js and share them with the community.
3. [Hosting your Robo](./hosting.md) - Get your Robo up and running on a hosting service to ensure it's always online and ready to serve your Discord server.
