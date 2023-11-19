import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# States 💾

States are your Robo's personal memory bank. They store data, allowing your bot to remember information across its lifespan. However, states are ephemeral; they clear out when your Robo powers off.

On the flip side, if you're tweaking your Robo using `/dev restart` or playing around in dev mode, states will survive. They stick around through hot reloads and restarts, waiting patiently for the next run.

## Usage 📝

States are a breeze to use. Check out this example:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/add-points.js"
import { setState, getState } from '@roboplay/robo.js'

export default () => {
	let currentPoints = getState('currentPoints') ?? 0
	setState('currentPoints', currentPoints + 10)
	return `You've gained 10 points! Your current total is ${currentPoints + 10} points.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/add-points.ts"
import { setState, getState } from '@roboplay/robo.js'
import type { CommandResult } from '@roboplay/robo.js'

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
import { getState } from '@roboplay/robo.js'

export default () => {
	let currentPoints = getState('currentPoints') ?? 0
	return `You currently have ${currentPoints} points.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/get-points.ts"
import { getState } from '@roboplay/robo.js'
import type { CommandResult } from '@roboplay/robo.js'

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
import { setState, getState } from '@roboplay/robo.js'

export default () => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 1)
	return `Counter in Foo module is now ${counter + 1}.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/modules/foo/commands/increment.ts"
import { setState, getState } from '@roboplay/robo.js'
import type { CommandResult } from '@roboplay/robo.js'

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
import { setState, getState } from '@roboplay/robo.js'

export default () => {
	let counter = getState('counter') ?? 0
	setState('counter', counter + 5)
	return `Counter in Bar module is now ${counter + 5}.`
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/modules/bar/commands/bar-increment.ts"
import { setState, getState } from '@roboplay/robo.js'
import type { CommandResult } from '@roboplay/robo.js'

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
import { State } from '@roboplay/robo.js'

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

```typescript showLineNumbers title="/src/modules/foo/commands/increment.ts" {5}
import { setState, getState } from '../state.js'
import type { CommandResult } from '@roboplay/robo.js'

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
import { setState } from '@roboplay/robo.js'

export default () => {
	// Setting a state with persist option
	setState('importantData', 'Never forget this', { persist: true })
	return "Data has been safely stored. Don't worry, Robo won't forget!"
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/commands/set-important-data.ts" showLineNumbers {5}
import { setState } from '@roboplay/robo.js'
import type { CommandResult } from '@roboplay/robo.js'

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

Let's keep that Robo memory working for you! Enjoy exploring with states. 🚀
