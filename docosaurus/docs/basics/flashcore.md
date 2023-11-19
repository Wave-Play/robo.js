import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# Flashcore ⚡

**Flashcore** is your Robo's built-in database—ready to hold onto all the key-value pairs your Robo needs for the long haul. Trust us, it's a breeze to use!

## Saving and Fetching Data

Think of **Flashcore** as **[States](/docs/basics/states)** except permanent. It's in it for the long game, and yes, it's async! Here's how we're handling a user's high score in a game:

Stashing the high score:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/update-score.js" {18}
import { Flashcore } from '@roboplay/robo.js'

export const config = {
	options: [
		{
			name: 'score',
			description: 'The new high score',
			type: 'integer',
			required: true
		}
	]
}

export default async (interaction) => {
	const userId = interaction.user.id
	const score = interaction.options.get('score')?.value

	await Flashcore.set(userId, score)
	return `New high score of ${score} stashed away! 🎉`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/update-score.ts" {18}
import { Flashcore, type CommandConfig } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	options: [
		{
			name: 'score',
			description: 'The new high score',
			type: 'integer',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const userId = interaction.user.id
	const score = interaction.options.get('score')?.value as number

	await Flashcore.set(userId, score)
	return `New high score of ${score} stashed away! 🎉`
}
```

</TabItem>
</Tabs>

Fetching the high score:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript title="/src/commands/get-score.js" showLineNumbers {6}
import { Flashcore } from '@roboplay/robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	const score = await Flashcore.get(userId)
	return score ? `High score alert: ${score}! 🏆` : 'No high score found. Game time! 🎮'
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/commands/get-score.ts" showLineNumbers {6}
import { Flashcore } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export default async (interaction: CommandInteraction) => {
	const userId = interaction.user.id

	const score = await Flashcore.get(userId)
	return score ? `High score alert: ${score}! 🏆` : 'No high score found. Game time! 🎮'
}
```

</TabItem>
</Tabs>

:::info Heads Up!!!

### Don't forget to `await` your Flashcore calls!

:::

## Deleting Data

You can delete a key from Flashcore with the `delete()` function.

Here's a command that deletes a user's high score:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript title="/src/commands/delete-score.js" showLineNumbers {6}
import { Flashcore } from '@roboplay/robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	await Flashcore.delete(userId)

	return `Deleted ${userId}'s high score...`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/commands/delete-score.ts" showLineNumbers {6}
import { Flashcore } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export default async (interaction: CommandInteraction) => {
	const userId = interaction.user.id

	await Flashcore.delete(userId)

	return `Deleted ${userId}'s high score...`
}
```

</TabItem>
</Tabs>

## Data Types

Feel free to store any **_serializable_** data type in Flashcore. Primitives and objects are both supported, but not functions or class instances!

```javascript showLineNumbers
await Flashcore.set('banned', true)
await Flashcore.set('score', 40)
await Flashcore.set('top-name', 'Robo')
await Flashcore.set('top-user', {
	name: 'Robo',
	score: 40
})
await Flashcore.set('top-games', [
	{ name: 'Robo', score: 40 },
	{ name: 'Robo 2', score: 30 },
	{ name: 'Robo 3', score: 20 }
])
```

When you fetch this data again, it'll be the same type as when you saved it.

```javascript showLineNumbers
const isBanned = await Flashcore.get('banned') // boolean
const score = await Flashcore.get('score') // number
const topName = await Flashcore.get('top-name') // string
const topGames = await Flashcore.get('top-games') // object array
```

## Watching for Changes

You can also watch for changes to a key's value over time with the `on()` function.

Here's a command that sends a message to a channel whenever a user's high score changes:
<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commmands/watch-score.js" {6-8}
import { Flashcore } from '@roboplay/robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	Flashcore.on(userId, (score) => {
		interaction.channel.send(`High score alert for ${userId}: ${score}! 🏆`)
	})

	return `Watching for changes to ${userId}'s high score...`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commmands/watch-score.ts" {6-8}
import { Flashcore } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export default async (interaction: CommandInteraction) => {
	const userId = interaction.user.id

	Flashcore.on(userId, (score) => {
		interaction.channel.send(`High score alert for ${userId}: ${score}! 🏆`)
	})

	return `Watching for changes to ${userId}'s high score...`
}
```

</TabItem>
</Tabs>

You can also stop watching for changes with the `off()` function.

Here's a command that stops watching for changes to a user's high score:
<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/stop-watching-score.js" {6}
import { Flashcore } from '@roboplay/robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	Flashcore.off(userId)

	return `Stopped watching for changes to ${userId}'s high score...`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/stop-watching-score.ts" {6}
import { Flashcore } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export default async (interaction: CommandInteraction) => {
	const userId = interaction.user.id

	Flashcore.off(userId)

	return `Stopped watching for changes to ${userId}'s high score...`
}
```

</TabItem>
</Tabs>

## Namespaces

Flashcore is a key-value store, so it's important to keep your keys unique. To help with this, Flashcore supports namespacing. Namespacing is a way to group your keys so they don't collide with other keys in the store. _This is particularly useful when you're working with multiple servers or users!_

Every Flashcore function accepts an `options` object as its last argument. This object has a `namespace` property that you can use to namespace your keys.

```javascript
Flashcore.set('my-key', 'example-value', {
	namespace: 'my-namespace'
})
```

Here's how we're namespacing a user's high score for specific servers:
<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/update-score.js" {19-21}
import { Flashcore } from '@roboplay/robo.js'

export const config = {
	options: [
		{
			name: 'score',
			description: 'The new high score',
			type: 'integer',
			required: true
		}
	]
}

export default async (interaction) => {
	const userId = interaction.user.id
	const serverId = interaction.guild.id
	const score = interaction.options.get('score')?.value

	await Flashcore.set(userId, score, {
		namespace: serverId
	})

	return `New high score of ${score} stashed away! 🎉`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/update-score.ts" {19-21}
import { Flashcore, type CommandConfig } from '@roboplay/robo.js'
import type { CommandInteraction } from 'discord.js'

export const config: CommandConfig = {
	options: [
		{
			name: 'score',
			description: 'The new high score',
			type: 'integer',
			required: true
		}
	]
}

export default async (interaction: CommandInteraction) => {
	const userId = interaction.user.id
	const serverId = interaction.guild.id
	const score = interaction.options.get('score')?.value as number

	await Flashcore.set(userId, score, {
		namespace: serverId
	})

	return `New high score of ${score} stashed away! 🎉`
}
```

</TabItem>
</Tabs>

Now every server has its own high score for each user! Just remember to namespace your keys when you're fetching them too:

```javascript
await Flashcore.get(userId, {
	namespace: interaction.guild.id
})
```

## Using Keyv Adapters

Flashcore's storage medium isn't set in stone. It's cozy with the file system by default but can switch to Keyv adapters. Want to use SQLite instead of the file system? You can configure this in the `robo.mjs` config file:

```javascript showLineNumbers title="/config/robo.mjs" {5-7}
import { SQLite } from '@keyv/sqlite'

export default {
	flashcore: {
		keyv: {
			store: new SQLite('sqlite://robo.db')
		}
	}
}
```

:::tip

Dig into more about Keyv Adapters on their [GitHub repo](https://github.com/jaredwray/keyv/tree/main#storage-adapters).

:::

### TypeScript Support

Flashcore supports generics when retrieving data with TypeScript. This means you can specify the type of data you're expecting to get back from Flashcore for better type safety.

```typescript showLineNumbers
// Primitives are fully supported
const isBanned = await Flashcore.get<boolean>(userId + '-banned')
const score = await Flashcore.get<number>(userId + '-score')
const topName = await Flashcore.get<string>('top-name')

// Objects are supported too!
interface Game {
	name: string
}
interface UserSettings {
	theme: string
	notifications: boolean
}
const topGames = await Flashcore.get<Game[]>('top-games')
const settings = await Flashcore.get<UserSettings>(userId + '-settings')
```

:::info Disclaimer

This will only tell TypeScript what type of data you're expecting to get back. It won't parse the data into that type for you, so make sure you're saving the right type of data to begin with!

:::
