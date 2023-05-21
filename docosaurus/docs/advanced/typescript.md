# TypeScript 🚀

TypeScript is like JavaScript's cooler cousin, ready to swoop in and save the day by catching those sneaky typos and helping you figure out what code exists. And guess what? It's super easy to learn, too! If you're already buds with JavaScript, hop on over to the [W3Schools TypeScript Tutorial](https://www.w3schools.com/typescript/) to kick things off!

Robo.js and TypeScript? They're BFFs. With first-class TypeScript support, you can say goodbye to setting up compiling or handling it yourself. Just stick to the `dev` and `build` commands, and you're golden. Plus, Robo.js uses the zippy Rust-based compiler, [SWC](https://swc.rs/), for a nice performance boost.

## Setting Up TypeScript Projects

Ready to roll? The `create-robo` CLI is here to kickstart your TypeScript projects without breaking a sweat:

```bash
npx create-robo my-awesome-robo --ts
```

For existing projects, just install `@swc/core` and `typescript` as dev dependencies, whip up a `tsconfig.json` file, and swap out those `.js` files for `.ts`:

```bash
npm install --save-dev @swc/core typescript
```

Here's an example `tsconfig.json` file to get you started:

```json
{
	"compilerOptions": {
		"target": "ESNext",
		"lib": ["esnext"],
		"allowJs": true,
		"skipLibCheck": true,
		"strict": true,
		"forceConsistentCasingInFileNames": true,
		"noEmit": true,
		"esModuleInterop": true,
		"module": "esnext",
		"moduleResolution": "node",
		"resolveJsonModule": true,
		"isolatedModules": true,
		"incremental": true
	},
	"include": ["**/*.ts"],
	"exclude": ["node_modules"]
}
```

## TypeScript Types in Robo.js

Robo.js was born and raised with TypeScript, so it's got native support for all those types. You'll run into common ones like `CommandConfig`, `EventConfig`, `CommandResult`, and `Config`, along with more advanced types like `Plugin` and `Manifest`. Check out this code example of an async Robo command with a custom export config object:

```typescript
import { CommandConfig, CommandResult } from '@roboplay/robo.js'

export const config: CommandConfig = {
	description: 'An async example command'
}

export default async (): Promise<CommandResult> => {
	await new Promise((resolve) => setTimeout(resolve, 1000))
	return 'Waited for 1 second.'
}
```

Using TypeScript means you'll need types for interactions and other related objects. No worries, just import them straight from Discord.js! Here's an example:

```typescript
import { CommandInteraction } from 'discord.js'

export default (interaction: CommandInteraction) => {
	interaction.reply('Hello, TypeScript!')
}
```

## Building Plugins with TypeScript

Why not build plugins with TypeScript? It's a match made in heaven for better type-safety and an awesome development experience. And the best part? The `robo build plugin` command already takes care of building plugins with TypeScript for you:

```bash
robo build plugin
```

## TypeScript in Config Files

Config files may be in JavaScript format, but TypeScript's still got your back! Just use `@type` annotation comments to harness its power. Editors like VS Code will support these annotations, giving you a smooth sail with autocompletion suggestions and type checking.

Here's an example of a config file with the GPT plugin:

```javascript
// @ts-check

/** @type {import('@roboplay/robo.js').Plugin} */
const gptPlugin = [
	'@roboplay/gpt',
	{
		// Your GPT plugin config options...
	}
]

/** @type {import('@roboplay/robo.js').Config} */
export default {
	// Your config options...
	plugins: [gptPlugin]
}
```

In this example, the `@ts-check` and `@type` annotation comments clue in the editor on the types for the variables below. You'll be treated to autocompletion suggestions and type checking as you code, making your code super readable and easy to maintain. 🎉

## Smoothing Imports with Path Aliases 🚀

Do `../../` paths keep showing up in your nightmares? If the answer is a resounding "Yes!", path aliases in TypeScript can be your dreamscape! This superhero of code organization squashes pesky, winding relative imports, paving the way for cleaner, easier-to-navigate code streets.

Slide this setup into your `tsconfig.json`:

```json
{
	// ... rest of tsconfig.json
	"compilerOptions": {
		"paths": {
			"@/robo/*": ["src/*"],
			"@/something/*": ["src/modules/something/*"]
		}
	}
}
```

Now, TypeScript is your faithful sidekick, transforming any `@/robo/` or `@/something/` imports into `src/` and `src/modules/something/` respectively. Think of the `baseUrl` as your trusty map (defaults to the project directory, `.`) that these paths navigate from.

Voila! Your import statements turn magical:

```typescript
// Before
import { someVariable } from '../../../../modules/something/commands/someCommand.js'

// After
import { someVariable } from '@/something/commands/someCommand.js'
```

## Monorepos: Your Codebase Universe 🌐

Ever wished for a cozy little universe where all your projects could live together? Monorepos are that dream come true! They bundle multiple projects in one repository, transforming code sharing and management into a walk in the park.

In this shared utopia, your Robo can coexist with other projects. Here's a typical monorepo layout:

```
/my-monorepo
├── /robo
│   ├── /.robo
│   ├── /src
│   └── package.json
├── /api
│   ├── /dist
│   ├── /src
│   └── package.json
└── package.json
```

Although Robo.js and monorepos naturally get along, there's a secret sauce for importing bits across projects – [the magic of TypeScript's path aliases](#smoothing-imports-with-path-aliases-🚀) ✨.

Let's configure the path aliases:

```json
{
	// ... rest of tsconfig.json
	"compilerOptions": {
		"paths": {
			"@/api/*": ["../api/dist/*"],
			"@/robo/*": ["src/*"],
			"@/something/*": ["src/modules/something/*"]
		}
	}
}
```

> **Just one golden rule:** always reference the compiled files (residing in `/dist`), not the raw `.ts` ones when sharing code across TypeScript projects.

With this, `@/api` points to `/api/dist` — home to the compiled files from the `api` project. For example, importing a function from the api project into your Robo.js project is as simple as:

```ts
// You can now import from other projects in your Robo!
import { someFunction } from '@/api/someFile.js'
```

And voila! Now your projects can freely share and reuse code across your monorepo universe!
