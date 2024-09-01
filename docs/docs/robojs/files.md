# 📂 Robo File Structure

The primary way to create with Robo.js is through the file structure. This is the foundation of Robo.js and is used to determine your project's functionality.

If you're familiar with Next.js, you'll feel right at home. If not, no worries — Robo.js keeps things simple. All you need to know is how to arrange your files. And that's it. Seriously!

## Standard Structure

Standard Robo.js projects contain the following directories:

- `/.robo`: Generated files for Robo.js to manage. You can ignore this.
- `/config`: The configuration file(s) for your project.
- `/src`: Source code for your project functionality.
- `.env`: Environment variables for your project.
- `package.json`: Project metadata and dependencies.

You will be working primarily in the `/src` directory. This is where you code your Project's features. `/config` is where you can tweak project and plugin configurations.

Depending on what other things you have installed - like ESLint or Prettier - you may have additional files or directories outside of these.

### Source Code

The `/src` directory is where you'll spend most of your time. Depending on what you're building, you'll have to pay attention to different directories in it.

Any type of file is supported as long as Node.js supports it. This includes JavaScript, **[TypeScript](../create-robo/typescript)**, JSON, and more. TypeScript works out of the box, so you can use it without any additional setup.

### Configuration

You can find config files in the `/config` directory. These files are used to configure your project and plugins. Plugin config files are generated in here when you run `npx robo add`.

You may rarely need to edit these files, if at all. See the **[Configuration](./config)** section for more information.

### Environment Variables

The `.env` file is where you store sensitive information, such as API keys, database URLs, or Discord tokens. These variables are loaded into your project when it starts.

See the **[Environment Variables](../discord-bots/secrets)** section for more information.

### Package File

The `package.json` file is standard for Node.js projects. It contains metadata about your project, such as the name, version, and dependencies. You can also add scripts to run commands, like `npm run dev`.

## Modules

For larger projects, you can use modules to group similar functionality together to keep things clean. Each module is its own mini-project within your main project that follows the same Robo File Structure.

Check out **[Modules](./modules)** for more information.

## .robo Directory

`/.robo` is special because it's managed by Robo.js. It contains generated files that Robo.js uses to manage your project. You can ignore this directory, as it's not meant for manual editing, but feel free to keep reading if you're curious.

### Build

`/.robo/build` contains compiled files from your project. This is where your TypeScript files are compiled to JavaScript, or where your project is bundled for production.

For plugins, this is what gets published to NPM.

### Data

`/.robo/data` contains **[Flashcore](./flashcore)** data. Flashcore uses the local filesystem to store data by default, but can be configured to use a database of your choice.

:::warning

Be careful not to delete this directory or you may lose important data!

:::

### Manifest

The `/.robo/manifest.json` file contains information about your project, such as the project name, version, plugins, directories in use, and more. This file is generated and updated by Robo.js for performant startup times.

### Temp Files

Sometimes you may see a `/.robo/temp` directory. This is used for temporary files that Robo.js generates during runtime. You know, things like intermediate files during compression and such.

<!--
## Entry File

You may not need it for every project, but the entry file is the starting point for your project. It's where Robo.js looks to start your project. Kinda like running `node index.js`. The entry file is usually named `start.js` (or `.ts`) and is located in the `/src/robo` directory.

Plugins can also have their own entry files, so you may not need your own if you're only using plugin features, such as making a Discord bot. Because of this, assume that your project may have multiple entry files that run simultaneously.

## Lifecycle

Robo.js has a lifecycle that runs through different stages when your project starts. This includes loading plugins, starting the server, and more. You can hook into these stages to run your own code. Lifecycle hooks are located in the `/src/robo` directory, no different than the entry file.

The lifecycle hooks are:

- `load.js`: Runs before the project starts.
- `start.js`: Runs when the project starts.
- `stop.js`: Runs when the project stops.
- `restart.js`: Runs when the project restarts. (instead of stopping)
-->
