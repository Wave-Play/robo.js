import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 💾 State Management

States are your Robo's personal memory bank. They store data, allowing your bot to remember information across its lifespan. However, states are ephemeral; they clear out when your Robo powers off.

On the flip side, if you're tweaking your Robo using `/dev restart` or playing around in dev mode, states will survive. They stick around through hot reloads and restarts, waiting patiently for the next run.

## Usage 📝

States are a breeze to use. Check out this example:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/add-points.js"
import { setState, getState } from 'robo.js'

export default () => {
	let currentPoints = getState('currentPoints') ?? 0
	setState('currentPoints', currentPoints + 10)
	return `You've gained 10 points! Your current total is ${currentPoints + 10} points.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/add-points.ts"
import { setState, getState } from 'robo.js'
import type { CommandResult } from 'robo.js'

export default (): CommandResult => {
	let currentPoints = getState('currentPoints') ?? 0
	setState('currentPoints', currentPoints + 10)
	return `You've gained 10 points! Your current total is ${currentPoints + 10} points.`
}
```

</TabItem>
</Tabs>

And you can retrieve state values like so:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/get-points.js"
import { getState } from 'robo.js'

export default () => {
	let currentPoints = getState('currentPoints') ?? 0
	return `You currently have ${currentPoints} points.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/get-points.ts"
import { getState } from 'robo.js'
import type { CommandResult } from 'robo.js'

export default (): CommandResult => {
	let currentPoints = getState('currentPoints') ?? 0
	return `You currently have ${currentPoints} points.`
}
```

</TabItem>
</Tabs>

## Forking Namespace 🍴

Imagine two different modules trying to use a state named `counter`. Without careful management, they could conflict, leading to unexpected results. Here's how it might look:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/modules/foo/commands/increment.js"
import { setState, getState } from 'robo.js'

export default () => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 1)
	return `Counter in Foo module is now ${counter + 1}.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/modules/foo/commands/increment.ts"
import { setState, getState } from 'robo.js'
import type { CommandResult } from 'robo.js'

export default (): CommandResult => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 1)
	return `Counter in Foo module is now ${counter + 1}.`
}
```

</TabItem>
</Tabs>

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/modules/bar/commands/bar-increment.js"
import { setState, getState } from 'robo.js'

export default () => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 5)
	return `Counter in Bar module is now ${counter + 5}.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/modules/bar/commands/bar-increment.ts"
import { setState, getState } from 'robo.js'
import type { CommandResult } from 'robo.js'

export default (): CommandResult => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 5)
	return `Counter in Bar module is now ${counter + 5}.`
}
```

</TabItem>
</Tabs>

In this scenario, the `counter` state would get jumbled between the `foo` and `bar` modules. To avoid this mess, we can fork the state:

```javascript showLineNumbers title="/src/modules/foo/state.js/" {4}
import { State } from 'robo.js'

// Forking the state object
const { getState, setState } = State.fork('foo')
export { getState, setState }
```

Now, the `foo` module has its own clean namespace. Import these forked functions in your module's commands and events to prevent state conflicts. Here's an example:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/modules/foo/commands/increment.js" {5}
import { setState, getState } from '../state.js'

export default () => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 1)
	return `Counter in Foo module is now ${counter + 1}.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/modules/foo/commands/increment.ts" {6}
import { setState, getState } from '../state.js'
import type { CommandResult } from 'robo.js'

export default (): CommandResult => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 1)
	return `Counter in Foo module is now ${counter + 1}.`
}
```

</TabItem>
</Tabs>

## Persisting Data 🔄

States vanish when your Robo powers off. Unless you set them to persist, that is. With the `persist` option, your data will be stored safely for when Robo gets back to work:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript title="/src/commands/set-important-data.js" showLineNumbers {5}
import { setState } from 'robo.js'

export default () => {
	// Setting a state with persist option
	setState('importantData', 'Never forget this', { persist: true })
	return "Data has been safely stored. Don't worry, Robo won't forget!"
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/commands/set-important-data.ts" showLineNumbers {6}
import { setState } from 'robo.js'
import type { CommandResult } from 'robo.js'

export default (): CommandResult => {
	// Setting a state with persist option
	setState('importantData', 'Never forget this', { persist: true })
	return "Data has been safely stored. Don't worry, Robo won't forget!"
}
```

</TabItem>
</Tabs>

Now, even if your Robo powers down, the `importantData` state will still be there when it wakes up. Under the hood, Robo.js uses **Flashcore** to make all this magical persistence happen. Pretty cool, right?

:::info

Values stored as state must be serializable. If they're not, they can't be persisted. Don't try to store complex objects like a Discord.js Guild or Message—keep it simple.

:::

## Namespaces

Namespacing in States helps you avoid key collisions and keep your data well-organized, particularly when dealing with multiple contexts like different users or servers.

### How it Works

Namespacing functions similarly to drawers or compartments where you can categorize and store your data separately. This is incredibly useful when you need to store similar types of data for different entities without any mix-up.

To use a namespace in States, you include it in the `options` object when you call `getState` or `setState`. This object has a `namespace` property where you define your desired namespace.

For example, setting a value with a namespace looks like this:

```javascript
setState('my-key', 'example-value', {
	namespace: 'my-namespace'
})
```

Here, the key `'my-key'` is placed under the `'my-namespace'` category, keeping it distinct from the same key in other namespaces. To retrieve the value, you would use the same namespace:

```javascript
const value = await getState('my-key', {
	namespace: 'my-namespace'
})
```

### Practical Example

Imagine you have a Discord bot that hosts daily challenges in different servers. You want to track each user's participation in these challenges separately for each server. This is where namespacing becomes incredibly useful.

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commmands/daily-challenge.js" {9,18}
import { getState, setState } from 'robo.js'

export default async (interaction) => {
	const userId = interaction.user.id
	const challengeId = 'daily-challenge' // Example challenge ID

	// Fetch the user's challenge participation state for this server
	const userParticipation =
		(await getState(userId, {
			namespace: interaction.guildId
		})) ?? {}

	// Increment the user's participation count for the specific challenge
	const newParticipationCount = (userParticipation[challengeId] ?? 0) + 1
	userParticipation[challengeId] = newParticipationCount

	// Update the state with the new count
	await setState(userId, userParticipation, {
		namespace: interaction.guildId
	})

	return `You've participated in the '${challengeId}' ${newParticipationCount} times in this server! Keep it up!`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commmands/daily-challenge.ts" {11,20}
import { getState, setState } from 'robo.js'
import type { CommandResult } from 'robo.js'
import type { ChatInputCommandInteraction } from 'discord.js'

export default async (interaction: ChatInputCommandInteraction): Promise<CommandResult> => {
	const userId = interaction.user.id
	const challengeId = 'daily-challenge' // Example challenge ID

	// Fetch the user's challenge participation state for this server
	const userParticipation =
		(await getState(userId, {
			namespace: interaction.guildId
		})) ?? {}

	// Increment the user's participation count for the specific challenge
	const newParticipationCount = (userParticipation[challengeId] ?? 0) + 1
	userParticipation[challengeId] = newParticipationCount

	// Update the state with the new count
	await setState(userId, userParticipation, {
		namespace: interaction.guildId
	})

	return `You've participated in the '${challengeId}' ${newParticipationCount} times in this server! Keep it up!`
}
```

</TabItem>
</Tabs>

In this example, the bot tracks how many times a user has participated in a specific challenge (`daily-challenge`) in each server. The `getState` and `setState` functions use the server ID as the namespace, ensuring that participation counts are kept separate and accurate for each server.

By using namespacing in this way, you can create complex, server-specific interactions that enrich the user experience without data collision or confusion.

<!--
### Multi-Layered Namespacing

States also support multi-dimensional namespaces using arrays. This is especially handy when you want to organize data by multiple factors, such as server and user.

```javascript
setState('someKey', someData, {
	namespace: [interaction.guildId, interaction.userId]
})
```

In this example, the data is tagged with both the server ID and the user ID, creating a highly organized and collision-free storage system in memory.

-->

## Opting for States over Flashcore

Opt for States when handling data that's needed temporarily or within a single session. States excel in scenarios where speed is crucial and data doesn't need to survive a Robo shutdown.

- **Speed & Synchronicity:** Immediate updates and access, ideal for data requiring quick interactions.
- **Session-Specific Data:** Perfect for temporary, transient data not meant to be stored long-term.
- **In-Memory Storage:** Operates using RAM, ensuring rapid data manipulation.
- **Data Type Flexibility:** Can store diverse data types, including complex objects and classes.
