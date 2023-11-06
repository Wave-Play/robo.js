# Flashcore ⚡

Flashcore is your Robo's built-in database—ready to hold onto all the key-value pairs your Robo needs for the long haul. Trust us, it's a breeze to use!

## Saving and Fetching Data 📦

Think of Flashcore as [States](/docs/basics/states) with a time capsule. It's in it for the long game, and yes, it's async! Here's how we're handling a user's high score in a game:

Stashing the high score:

```javascript
// File: /src/commands/update-score.js
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
	const score = interaction.options.get('score')?.value as number

	await Flashcore.set(userId, score)
	return `New high score of ${score} stashed away! 🎉`
}
```

Fetching the high score:

```javascript
// File: /src/commands/get-score.js
import { Flashcore } from '@roboplay/robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	const score = await Flashcore.get(userId)
	return score ? `High score alert: ${score}! 🏆` : "No high score found. Game time! 🎮"
}
```

> **Heads up:** Don't forget to `await` your Flashcore calls!

## Watching for Changes 📡

You can also watch for changes to a key's value over time with the `on()` function.

Here's a command that sends a message to a channel whenever a user's high score changes:

```javascript
// File: /src/commands/watch-score.js
import { Flashcore } from '@roboplay/robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	Flashcore.on(userId, (score) => {
		interaction.channel.send(`High score alert for ${userId}: ${score}! 🏆`)
	})

	return `Watching for changes to ${userId}'s high score...`
}
```

You can also stop watching for changes with the `off()` function.

Here's a command that stops watching for changes to a user's high score:

```javascript
// File: /src/commands/stop-watching-score.js
import { Flashcore } from '@roboplay/robo.js'

export default async (interaction) => {
	const userId = interaction.user.id

	Flashcore.off(userId)

	return `Stopped watching for changes to ${userId}'s high score...`
}
```

## Namespacing Data 📇

Flashcore is a key-value store, so it's important to keep your keys unique. To help with this, Flashcore supports namespacing. Namespacing is a way to group your keys so they don't collide with other keys in the store. *This is particularly useful when you're working with multiple servers or users!*

Every Flashcore function accepts an `options` object as its last argument. This object has a `namespace` property that you can use to namespace your keys.

```javascript
Flashcore.set('my-key', 'example-value', {
	namespace: 'my-namespace'
})
```

Here's how we're namespacing a user's high score for specific servers:

```javascript
// File: /src/commands/update-score.js
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
	const score = interaction.options.get('score')?.value as number

	await Flashcore.set(userId, score, {
		namespace: serverId
	})

	return `New high score of ${score} stashed away! 🎉`
}
```

## Using Keyv Adapters 🎛️

Flashcore's storage medium isn't set in stone. It's cozy with the file system by default but can switch to Keyv adapters. Want to use SQLite instead of the file system? You can configure this in the `robo.mjs` config file:

```javascript
// File: /.config/robo.mjs
import { SQLite } from '@keyv/sqlite'

export default {
	flashcore: {
		keyv: {
			store: new SQLite('sqlite://robo.db')
		}
	}
}
```

> Dig into more about Keyv Adapters on their [GitHub repo](https://github.com/jaredwray/keyv/tree/main#storage-adapters).
