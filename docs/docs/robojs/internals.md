# 👀 Understanding Internals

Ready to understand how it comes alive? Here's a simplified overview of Robo.js's internals so you can get started with confidence.

:::tip

_You don't need to understand this to use Robo.js,_ but it's helpful to know what's going on under the hood if you're curious!

:::

## The Installed Package

The core of Robo.js divides into two components: the **CLI** and the **Runtime**. When you install `robo.js`, these are added to your `node_modules`.

### CLI

It serves as the primary means for starting and building your Robo, enabling streamlined development by handling configurations and tooling. Commands within the CLI facilitate automatic restarts, file watching, TypeScript integrations, and plugin installations. The CLI is designed to be efficient, loading only essential tools for specific tasks, especially during production.

### Runtime

This component operates with your code, managing events, loading plugins, overseeing logs, and providing access to Robo APIs such as States and Flashcore. It incorporates Sage Assist and is designed for efficiency.

## Robo File Structure

Robo.js and its Platform Plugins mandate a specific organization of files. A consistent structure simplifies various operations.

## Build Process

Robos undergo a "build" phase before execution. Invoke `robo build` before `robo start`. For developers, `robo dev` builds automatically, updating with every file modification. Build results are stored in the `.robo` directory. This approach ensures both performance and predictability.

### Manifest

Robo files are cataloged in a manifest. This indexing accelerates the start-up process by eliminating the need to navigate the file tree. The manifest contributes to a reduced memory footprint, quicker boot-ups, and also contains Robo metadata, which aids debugging and features like `robo invite`.

### TypeScript

For those utilizing TypeScript, the files undergo conversion to JavaScript and subsequent optimization during the build process. This means hosting environments don't need TypeScript compilation abilities, and there's no need to bundle a TypeScript runtime such as `ts-node`.

> **By the way:** This step is bypassed by Bun due to native TypeScript support.

### Plugins

The build process also indexes plugin files, enhancing their performance. As plugins are expected to be pre-built using `robo build plugin` before being made public, there's no requirement for TypeScript processing. The pre-indexing of these plugins ensures swift integration into Robo. Additionally, plugins have the capability to modify the build process, enabling Robo.js's adaptability to various platforms and maintaining file structure flexibility.

### Registration

Platforms, like Discord, require information on the slash commands your Robo registers. This registration during the build process ensures platforms stay updated. Previously, manual script updating was required for slash commands. With Robo.js, this process is automated. The internal manifest file tracks modifications, ensuring updates are sent only when there's a genuine change, thus avoiding excessive API calls.

## Sage

Sage operates predominantly behind the scenes in Robo.js, functioning in various capacities.

### Sage Assist

Through Sage Assist, developers can directly return responses from slash commands, avoiding the direct use of interaction objects. Essentially, Sage Assist consists of built-in abstractions in the framework that modify the coding process seamlessly. No external server interactions occur as everything is self-contained.

### Sage Bot

Sage operates as a Robo on our dedicated Discord server, powered by Robo.js. Users can engage with Sage on this platform for questions related to the framework.

### Sage CLI

A distinct CLI from Robo.js, Sage CLI is optional and particularly useful during development. Its absence in a web host does not affect functionality. It offers framework upgrade automation, assists in converting plugins from modules and vice versa, and provides diagnostic capabilities for Robos.

Being a standalone CLI package ensures a reduction in storage needs in environments where it's not needed.
