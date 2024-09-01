import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# ⚡ Flashcore Database

**Flashcore** is your Robo's built-in database—ready to hold onto all the key-value pairs your Robo needs for the long haul. Trust us, it's a breeze to use!

## Saving and Fetching Data

Think of **Flashcore** as **[States](/docs/basics/states)** except permanent. It's in it for the long game, and yes, it's async! Here's how we're handling a user's high score in a game:

Stashing the high score:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/update-score.js" {18}
import { Flashcore } from 'robo.js'

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

```typescript showLineNumbers title="/src/commands/update-score.ts" {19}
import { Flashcore, type CommandConfig } from 'robo.js'
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
import { Flashcore } from 'robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	const score = await Flashcore.get(userId)
	return score ? `High score alert: ${score}! 🏆` : 'No high score found. Game time! 🎮'
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/commands/get-score.ts" showLineNumbers {7}
import { Flashcore } from 'robo.js'
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

Don't forget to `await` your Flashcore calls!

:::

## Deleting Data

You can delete a key from Flashcore with the `delete()` function.

Here's a command that deletes a user's high score:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript title="/src/commands/delete-score.js" showLineNumbers {6}
import { Flashcore } from 'robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	await Flashcore.delete(userId)

	return `Deleted ${userId}'s high score...`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/commands/delete-score.ts" showLineNumbers {7}
import { Flashcore } from 'robo.js'
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
import { Flashcore } from 'robo.js'

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

```typescript showLineNumbers title="/src/commmands/watch-score.ts" {7-9}
import { Flashcore } from 'robo.js'
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
import { Flashcore } from 'robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	Flashcore.off(userId)

	return `Stopped watching for changes to ${userId}'s high score...`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/stop-watching-score.ts" {7}
import { Flashcore } from 'robo.js'
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

In key-value stores, ensuring that your keys are unique is crucial. Flashcore's namespacing feature helps you do just that!

Think of namespacing like creating separate drawers for different categories of items. This way, the same item name in different drawers doesn't get mixed up. It's especially handy when you're managing data for various servers or user groups.

When you use any Flashcore function, you can include an `options` object as the last parameter. Within this, specify a `namespace` property to categorize your keys.

```javascript
Flashcore.set('my-key', 'example-value', {
	namespace: 'my-namespace'
})
```

This line effectively places `'my-key'` into a specific category or
"drawer" labeled `'my-namespace'`.

Let’s apply this to a real-world scenario, like tracking high scores for users across different servers. For each server, you can create a unique namespace. This way, the same user can have different scores on different servers, and there's no mix-up.

Here’s a snippet showing how to set a user's high score in a specific server's namespace:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/update-score.ts" {18-20}
import { Flashcore } from 'robo.js'

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

	await Flashcore.set(userId, score, {
		namespace: interaction.guildId
	})

	return `New high score of ${score} stashed away! 🎉`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/update-score.ts" {19-21}
import { Flashcore, type CommandConfig } from 'robo.js'
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

	await Flashcore.set(userId, score, {
		namespace: interaction.guildId
	})

	return `New high score of ${score} stashed away! 🎉`
}
```

</TabItem>
</Tabs>

In this example, `interaction.guildId` is our namespace. By doing this, each server gets its own unique set of high scores for each user.

And when you need to get a score, use the same namespace:

```javascript
await Flashcore.get(userId, {
	namespace: interaction.guildId
})
```

With namespacing, you efficiently manage data for different groups or contexts without any overlap or confusion!

<!-- You can also use arrays to create multi-layered namespaces. This is useful when you want to categorize data by multiple criteria. For instance, to store data for a user within a specific server, you can do something like this:

```javascript
await Flashcore.set('someKey', someData, { namespace: ['server123', 'user456'] });
```

Here, the data is categorized under both the server and user IDs, ensuring unique and organized storage. -->

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

## Opting for Flashcore over States

Flashcore should be your choice for data that requires long-term storage or needs to be preserved across sessions. It's particularly useful for settings, historical data, or any information that needs consistent and reliable storage.

- **Data Persistence:** Ensures long-term data storage, ideal for settings and permanent records.
- **Asynchronous Operations:** Provides consistent and reliable data operations, necessary for durable storage.
- **External Storage with Keyv Adapters:** Enables storing data in external databases like Postgres, offering flexibility and scalability.
- **Serializable Data Only:** Suited for serializable data, maintaining data stability and compatibility.
