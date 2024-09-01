import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 🔮 Sage Mode

Your Robo is more than just a bot; it's got its very own spirit guide: Sage.

Sage is all about smoothing out the rough edges, doing the heavy lifting, and leaving you with the fun stuff. It's your backstage crew, your invisible helping hand, your automatic pilot. You lead the way, and Sage is there to back you up.

## Replies 📩

Let's kick things off with replies. Normally, you'd need to use interaction.reply() to respond to a command, but Sage has a better idea. Just return your reply straight from your command function, and Sage will make sure it gets where it needs to go. It's tidier, it's simpler, and it even handles the tricky stuff like deferred commands.

- **Classic Way**

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/hello.js"
export default (interaction) => {
	interaction.reply({ content: 'Hello, classic!' })
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/hello.ts"
import type { CommandInteraction } from 'discord.js'

export default (interaction: CommandInteraction) => {
	interaction.reply({ content: 'Hello, classic!' })
}
```

</TabItem>
</Tabs>

- **Sage Way**

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/hello.js"
export default () => {
	return { content: 'Hello, Sage!' }
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/hello.ts"
import type { CommandResult } from 'robo.js'

export default (): CommandResult => {
	return { content: 'Hello, Sage!' }
}
```

</TabItem>
</Tabs>

Or for the minimalists among you...

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/hello.js"
export default () => 'Hello, Sage!'
```

</TabItem>

<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/hello.ts"
import type { CommandResult } from 'robo.js'

export default (): CommandResult => 'Hello, Sage!'
```

</TabItem>
</Tabs>

By the way, Sage has the same game plan for autocomplete functions. And if you decide to go rogue and do your own thing? No problem. Sage knows when to step aside and let you take the wheel.

## Deferred Replies ⏳

Every bot runs into tasks that take a bit longer, and that's where deferred replies come in. If you take too long to reply, Discord will serve up an error. That's why Sage steps in to auto-defer your replies if things are taking longer than 250ms. It's like your bot's very own traffic cop, stepping in when things are moving slow and backing off when they're zooming along. You can even customize the threshold or switch it off entirely.

Here's how it works:

- **Classic Way**

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/hello.js"
export default async (interaction) => {
	interaction.deferReply()
	await new Promise((resolve) => setTimeout(resolve, 4000)) // Artificial delay
	interaction.editReply('Hello, classic!')
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/hello.ts"
import type { CommandInteraction } from 'discord.js'

export default async (interaction: CommandInteraction) => {
	interaction.deferReply()
	await new Promise((resolve) => setTimeout(resolve, 4000)) // Artificial delay
	interaction.editReply('Hello, classic!')
}
```

</TabItem>
</Tabs>

- **Sage Way**

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/hello.js"
export default async () => {
	await new Promise((resolve) => setTimeout(resolve, 4000))
	return 'Hello, Sage!'
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/hello.ts"
import type { CommandResult } from 'robo.js'

export default async (): CommandResult => {
	await new Promise((resolve) => setTimeout(resolve, 4000))
	return 'Hello, Sage!'
}
```

</TabItem>
</Tabs>

And in case you're wondering, Sage won't waste time deferring if it's not needed. Check out how it handles a command that finishes in a flash:

```javascript showLineNumbers title="/src/commands/hello.js"
export default async () => {
	await new Promise((resolve) => setTimeout(resolve, 100))
	return 'Hello, Sage!'
}
```

With Sage on your side, your bot can stay snappy and responsive, even when it's got a lot on its plate.

## Error Replies 🚨

Everyone fumbles sometimes, even the best coders. But fret not. Sage has your back, like the best debugging buddy you never knew you needed. Stumble in your command functions or events, and Sage will spring into action with a detailed error message, showing you exactly where you tripped up.

Let's say you've got a command function with a not-so-obvious oopsie:

```javascript showLineNumbers title="/src/commands/whoooops.js"
export default () => {
  const undefinedVariable
  return undefinedVariable.toString()
}
```

Sage won't just shrug it off. It'll dish up the error info, a stack trace to guide your debugging journey, and even a time-locked log snapshot to show you exactly what went down.

## Background Errors 🌌

Sage isn't just there for the obvious fumbles. It's got an eagle eye for the sneaky, behind-the-scenes errors that aren't tied to a command or event. Normally, these culprits could crash your bot, but Sage is on guard. Just remember to set a debug channel in your environment variables ([here's how](/docs/basics/secrets)).

When a rogue error does pop up, Sage will ping it over to your debug channel. This means your bot keeps on trucking, while you're kept in the loop about any under-the-hood hiccups. Just remember, errors are like weeds - best deal with them rather than ignore them.

## Production Mode 🎭

When your bot steps into the limelight, Sage knows to keep the error messages backstage. You get to keep your channels looking sharp and shiny, free of debug clutter.

If you're hosting with **RoboPlay**, you're in for a treat! Your Robo dashboard comes with a debugging section that's more than just logs. It's like a treasure trove of debugging gems, complete with error deets, stack traces and time-locked log snapshots.

And if you're hosting elsewhere, remember that not all hosts are created equal. Some might just give you the basic error info, while others might not log errors at all. Sage's aim is to keep you in the loop, without holding your bot back. So, wherever you're hosting, make sure to suss out their logging capabilities.

## Configuration 🎛️

In the bustling world of Robos, flexibility is key, and Sage is no exception. Sage presents a control panel, filled with switches and buttons, granting you the ability to tweak and tune its behavior to your heart's content. Here's what's on the table:

- **Automatic deferrals:** Want to handle deferrals yourself? Flip this switch off.
- **Deferral threshold:** Tweak the time Sage waits before it steps in with a deferral.
- **Ephemeral replies:** Want replies to only be visible to those who trigger commands? Toggle this on.
- **Error messages:** Sometimes, a quiet bot is a good bot. Toggle this to mute Sage's error messages.

You can set these options globally for your entire Robo in the config file, or tune them individually for each command, context menu, or event.

- **Config File (robo-wide settings)**

```javascript showLineNumbers title="/config/robo.mjs"
export default {
	// ... other config options
	sage: {
		defer: false, // Disable automatic deferrals
		deferBuffer: 500, // Change deferral threshold to 500ms
		ephemeral: true, // Make all replies ephemeral
		errorReplies: true // Mute error messages
	}
}
```

- **Command, Context Menu, or Event Config (individual settings)**

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript showLineNumbers title="/src/commands/hello.js" {2-7}
export const config = {
	sage: {
		defer: false,
		deferBuffer: 500,
		ephemeral: true,
		errorReplies: true
	}
}

export default () => {
	return 'Hello, Sage!'
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript showLineNumbers title="/src/commands/hello.ts" {4-9}
import type { CommandConfig, CommandResult } from 'robo.js'

export const config: CommandConfig = {
	sage: {
		defer: false,
		deferBuffer: 500,
		ephemeral: true,
		errorReplies: true
	}
}

export default (): CommandResult => {
	return 'Hello, Sage!'
}
```

</TabItem>
</Tabs>

Now you've got the magic wand in your hand, ready to make Sage dance to your tune!
