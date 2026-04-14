<p align="center">✨ <strong>Generated with <a href="https://robojs.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/cli

Build standalone command-line applications with **file-based routing** powered by [Robo.js](https://robojs.dev). Create professional CLIs with minimal boilerplate, automatic help generation, and full TypeScript support.

- [📚 **Documentation:** Getting started](https://robojs.dev/cli)
- [✨ **Discord:** Robo - Imagine Magic](https://robojs.dev/discord)

## Features

- **File-based routing** - Commands map directly to files
- **Automatic help generation** - Help text generated from your config
- **Subcommand support** - Nested directories become subcommands
- **Type-safe options** - Full TypeScript inference for command options
- **Zero config** - Works out of the box

## Installation

Add to your existing Robo.js project:

```bash
npx robo add @robojs/cli
```

Or create a new project with the plugin:

```bash
npx create-robo my-cli -p @robojs/cli
```

## Quick Start

### 1. Create a command

Create `src/cli/hello.ts`:

```typescript
import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'

export const config = createCliCommandConfig({
  description: 'Say hello to someone',
  options: [
    { alias: '-n', name: '--name', description: 'Name to greet', type: 'string', default: 'World' }
  ]
} as const)

export default (ctx: CliContext<typeof config>) => {
  console.log(`Hello, ${ctx.options.name}!`)
}
```

### 2. Build and link

```bash
npx robo build
npm link
```

The `bin` field is automatically added to `package.json` during build, and `npm link` makes your CLI available by name.

### 3. Run it

```bash
my-cli hello
# Hello, World!

my-cli hello --name Robo
# Hello, Robo!
```

## Development

Use `robo dev` for watch mode — your CLI rebuilds automatically on every file change:

```bash
npx robo dev
```

The `bin` field is automatically added to `package.json` during build if it doesn't exist yet. To test with your actual CLI name, link your package:

```bash
npm link
mycli hello --name Robo
```

During `robo dev`, the interactive terminal provides `/cli link` (runs the link command for you), `/cli list`, and `/cli run <command>` for quick testing.

👉 [Full development guide](https://robojs.dev/cli/development)

## Creating Commands

Commands are created by placing files in `src/cli/`. The file path determines the command name.

### Basic Command

```typescript
// src/cli/greet.ts
// Usage: mycli greet

export const config = {
  description: 'Greet the user'
}

export default () => {
  console.log('Hello!')
}
```

### Command with Options

```typescript
// src/cli/build.ts
// Usage: mycli build --watch --output ./dist

import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'

export const config = createCliCommandConfig({
  description: 'Build the project',
  options: [
    { alias: '-w', name: '--watch', description: 'Watch for changes', type: 'boolean' },
    { alias: '-o', name: '--output', description: 'Output directory', type: 'string', default: './build' }
  ]
} as const)

export default (ctx: CliContext<typeof config>) => {
  console.log(`Building to ${ctx.options.output}...`)
  if (ctx.options.watch) {
    console.log('Watching for changes...')
  }
}
```

### Subcommands

Create nested directories for subcommands:

```
src/cli/
├── db/
│   ├── index.ts      # mycli db
│   ├── migrate.ts    # mycli db migrate
│   └── seed.ts       # mycli db seed
└── config/
    ├── get.ts        # mycli config get
    └── set.ts        # mycli config set
```

Example subcommand:

```typescript
// src/cli/db/migrate.ts
// Usage: mycli db migrate --target latest

import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'

export const config = createCliCommandConfig({
  description: 'Run database migrations',
  options: [
    { alias: '-t', name: '--target', description: 'Target version', type: 'string', default: 'latest' },
    { alias: '-f', name: '--force', description: 'Force migration', type: 'boolean' }
  ]
} as const)

export default (ctx: CliContext<typeof config>) => {
  console.log(`Migrating to ${ctx.options.target}...`)
  if (ctx.options.force) {
    console.log('Force mode enabled')
  }
}
```

### Positional Arguments

Enable positional arguments to accept values without flags:

```typescript
// src/cli/install.ts
// Usage: mycli install lodash express react

import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'

export const config = createCliCommandConfig({
  description: 'Install packages',
  positionalArgs: true
} as const)

export default (ctx: CliContext<typeof config>) => {
  const packages = ctx.args
  console.log(`Installing: ${packages.join(', ')}`)
}
```

## Command Configuration

### Option Properties

| Property | Type | Description |
|----------|------|-------------|
| `alias` | `string` | Short flag (e.g., `-n`) |
| `name` | `string` | Long flag (e.g., `--name`) |
| `description` | `string` | Help text for this option |
| `type` | `'string' \| 'boolean' \| 'number'` | Value type (default: `'string'`) |
| `required` | `boolean` | Whether the option is required |
| `default` | `any` | Default value if not provided |

### Option Type Inference

When using `createCliCommandConfig` with `as const`, TypeScript infers the correct types:

```typescript
import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'

export const config = createCliCommandConfig({
  description: 'Example command',
  options: [
    { alias: '-p', name: '--port', type: 'number', default: 3000 },  // number (has default)
    { alias: '-h', name: '--host', type: 'string' },                  // string | undefined
    { alias: '-v', name: '--verbose', type: 'boolean', required: true } // boolean (required)
  ]
} as const)

export default (ctx: CliContext<typeof config>) => {
  ctx.options.port    // TypeScript knows: number
  ctx.options.host    // TypeScript knows: string | undefined
  ctx.options.verbose // TypeScript knows: boolean
}
```

## Command Context

The handler receives a context object with:

| Property | Type | Description |
|----------|------|-------------|
| `args` | `string[]` | Positional arguments |
| `options` | `object` | Parsed option values |
| `logger` | `Logger` | Robo.js logger instance |
| `cwd` | `string` | Current working directory |
| `argv` | `string[]` | Raw arguments after command |

## Publishing Your CLI

### 1. Configure package.json

The `bin` field is auto-added during build. Just make sure `files` includes the build output:

```json
{
  "name": "my-awesome-cli",
  "version": "1.0.0",
  "files": [
    ".robo/build"
  ]
}
```

### 2. Build and publish

```bash
npx robo build
npm publish
```

### 3. Users can now run

```bash
npx my-awesome-cli hello
# or after global install
mycli hello
```

## Project Structure

```
my-cli/
├── src/
│   └── cli/
│       ├── hello.ts               # CLI commands
│       ├── db/
│       │   ├── index.ts
│       │   └── migrate.ts
├── config/
│   └── robo.ts                    # Robo.js config
├── package.json
└── tsconfig.json
```

## API Reference

### Exports from `robo.js/cli.js`

```typescript
// Configuration helper
import { createCliCommandConfig } from 'robo.js/cli.js'

// Types
import type {
  CliContext,           // Command handler context
  CliCommandConfig,     // Command configuration
  CliOptionConfig,      // Option configuration
  CliHandler,           // Handler function type
} from 'robo.js/cli.js'
```

### createCliCommandConfig

Type-safe configuration helper that enables TypeScript inference:

```typescript
import { createCliCommandConfig, type CliContext } from 'robo.js/cli.js'

export const config = createCliCommandConfig({
  description: 'My command',
  options: [
    { alias: '-n', name: '--name', type: 'string', required: true }
  ]
} as const)  // Don't forget `as const`!

export default (ctx: CliContext<typeof config>) => {
  // ctx.options.name is typed as `string`
}
```

## More on Robo.js

Explore more about Robo.js:

- [Quickstart](https://robojs.dev/getting-started)
- [Discord Bots](https://robojs.dev/discord-bots)
- [Discord Activities](https://robojs.dev/discord-activities)
- [Plugins](https://robojs.dev/plugins/overview)

> **Heads up!** This is the plugin documentation. For extending the internal Robo CLI (adding commands to `npx robo`), see the [CLI Extending Guide](https://robojs.dev/robo-cli/extending).
