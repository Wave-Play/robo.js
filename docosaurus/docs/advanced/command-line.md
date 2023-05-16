# Command Line Interface 🔨

Robo.js comes with a powerful Command Line Interface (CLI) to streamline your bot development process, making it more fun and easy! Here's how to use it:

```bash
npm exec robo dev
```

Simple, right? 

## Robo.js CLI 🌟

The Robo.js CLI helps you manage your bot project like a boss. Here's a quick overview of the available commands and options, grouped by their purpose:

```sh
Options:
  -V, --version         output the version number
  -h, --help            display help for command

Commands:
  dev [options]         Ready, set, code your bot to life! Starts development mode.
  start [options]       Starts your bot in production mode.
  
  build [options]       Builds your bot for production.
  build plugin          Optimizes your source files to be published as a plugin via npm.
  
  doctor                Checks if your project is healthy
  why [options] [text]  Find out why a command, event, permission, or scope is in your Robo.
                        e.g. /ping, @ready, %ADMINISTRATOR, +applications.commands
  help [command]        display help for command
  
  deploy [options]      Deploys your bot to RoboPlay!
  invite                Generates a link for servers to add your Robo.
```

#### Running 🏃‍♀️

- **`dev`**: The primary way to run your Robo during development. It behaves similarly to `nodemon` or `ts-node-dev`, restarting your project when changes are detected. This command runs `build` behind the scenes, automatically updating bot commands.
- **`start`**: Used for running your Robo in production after running `build`. This is only necessary if you're self-hosting instead of using RoboPlay to host your Robo for free.

#### Building 🏗️

- **`build`**: Prepares your project for production by compiling your source files, generating a manifest file, and registering any command updates. You need to run this command before using `start`.
- **`build plugin`**: Works similarly to `build`, but optimizes your source files to be published as a plugin via npm.

#### Debugging 🔍

- **`doctor`**: Automatically detects common problems and offers fixes. It can also allow plugins to tell you if they're set up correctly. For more information on fixing bugs, check out the [Debugging page](#).
- **`why`**: Analyzes why a command, event, permission, or scope is in your Robo. This can be used to track down which plugin added certain things or why specific events are firing. Use it like this: `robo why /ping`
- **`help`**: Displays help for this CLI or a specific command. Can be used like this: `robo help` or also as a command option `robo build --help`

#### Distributing 🚀

- **`deploy`**: Bundles your Robo's source files and hosts it on RoboPlay for free (currently invite-only).
- **`invite`**: Generates an invite link to add your Robo onto Discord servers with permissions and all. For more information on adding your bot, refer to the ["How do I add my bot?"](faq#how-do-i-add-my-bot) section of the FAQ.

## Interactive Quickstart CLI ⚡

The `create-robo` interactive CLI is your go-to for kickstarting fresh Robo.js projects and plugins! It's a nifty standalone tool that won't bloat your project, and it'll hold your hand through the setup process like a pro.

#### Crafting Your Robo 🤖

Ready to create a project named "my-awesome-robo"? Here's how:

```bash
npx create-robo my-awesome-robo
```

Once you're in, the CLI will walk you through three easy-peasy steps:

1. TypeScript or nah? (yes/no)
2. Choose your features! (ESLint, Prettier, Plugins - mix and match, or skip 'em all!)
3. Pop in your Discord token and client id. Wanna skip it? Just press enter, but remember to edit your `.env` file later.

#### Forging a Plugin 🔧

Got your eyes on crafting a plugin? Run the CLI with the `--plugin` option:

```bash
npx create-robo my-awesome-plugin --plugin
```

This will guide you through two simple steps:

1. TypeScript or nah? (yes/no)
2. Choose your features! (ESLint, Prettier)

#### Options

Feeling adventurous? This CLI's got options for ya:
- `--js` skips the TypeScript question and jumps straight to JavaScript
- `--ts` does the opposite: skips the TypeScript question and dives into TypeScript
- `-p`, `--plugin` lets you craft a plugin project instead of a full-fledged Robo
- `-t`, `--template <template>` grabs an existing example template. You can use a URL or a name from the available examples (e.g., `gpt-chatbot`). No template input? No problem! The CLI will let you choose.
- `-v`, `--verbose` cranks up the log volume during creation, perfect for troubleshooting when things go sideways.
