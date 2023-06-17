# Flashcore 🌩️

Flashcore is like your Robo's built-in database—ready to hold onto all the key-value pairs your Robo needs for the long haul. Trust us, it's a breeze to use!

## Riding the Flashcore Wave 🏄‍♂️

Think of Flashcore as [States](./states) with a time capsule. It's in it for the long game, and yes, it's async! Here's how we're handling a user's high score in a game:

Stashing the high score:

```javascript
// File: /src/commands/update-score.js
import { Flashcore } from '@roboplay/robo.js'

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

## Swapping with Keyv Adapters 🎛️

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
