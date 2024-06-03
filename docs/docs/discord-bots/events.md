import Tabs from '@theme/Tabs';
import TabItem from '@theme/TabItem';

# 📡 Events

Events are the real MVPs in bot development! They're the magical building blocks that make your bot come alive—everything, including commands, are built on top of events!

## Setting Up Events 🏗️

Setting up events is as easy as creating a file with the name of the event you want to listen to in the `events` directory. Let's say we want to respond when our bot is ready:

File structure:

```
/src
  /events
    ready.js
```

Code for `ready.js`:

```javascript title="/src/events/ready.js"
export default () => {
	console.log('Bot is ready!')
}
```

Bam! Now, when your bot is ready, it will log 'Bot is ready!' in the console.

> #### **Btw, this is just for example purposes.** Your Robo will automatically log when ready by default!

## Stacked Events 🥞

Need to listen to the same event with multiple files? No problem! Robo.js allows you to stack events. This is great for separating out different logic or features related to the same event. Let's say we want to do something else when the bot is ready:

File structure:

```
/src
  /events
    ready.js
    /ready
      playStatus.js
```

Code for `playStatus.js`:
<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript title="src/events/ready/playStatus.js"
export default (client) => {
	client.user.setActivity('with code')
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="src/events/ready/playStatus.ts"
import type { Client } from 'discord.js'

export default (client: Client) => {
	client.user.setActivity('with code')
}
```

</TabItem>
</Tabs>

Now, when the bot is ready, it will not only log 'Bot is ready!' in the console, but also set its status to 'Playing with code'!

For larger bots with more complex use cases, check out our [Modules Documentation](/docs/advanced/modules) to group your events and commands.

## Use Cases 🛠️

Listening to events opens up a world of possibilities! Here are a few examples:

- **ready.js**: Sets up initial bot status, schedules tasks, or sends a message to a specific channel when the bot starts.
- **guildMemberAdd.js**: Sends a welcome message or assigns a default role to a member when they join the guild.
- **messageCreate.js**: Listens to messages and responds based on the content.
- **interactionCreate.js**: Listens to button clicks and reactions. You can create a bot that responds to user interactions with your custom buttons or emoji reactions!
- **messageReactionAdd.js**: Detects when a new reaction is added to a message. Useful for reaction roles or interactive messages!

Different events will pass different parameters. For example, the `messageCreate` event will pass the `message` object, and you can use it to reply, react, or do whatever you want! Some events, like `voiceStateUpdate`, even pass down multiple parameters:

<Tabs groupId="examples-script">
<TabItem value="js" label="Javascript">

```javascript title="/src/events/voiceStateUpdate.js"
export default (oldState, newState) => {
	// do something with oldState and newState
}
```

</TabItem>
<TabItem value="ts" label="Typescript">

```typescript title="/src/events/voiceStateUpdate.ts"
import type { VoiceState } from 'discord.js'

export default (oldState: VoiceState, newState: VoiceState) => {
	// do something with oldState and newState
}
```

</TabItem>
</Tabs>

## Intents & Privileged Intents 🛡️

Depending on the events you're trying to listen to, you might need to add more intents in your bot's [configuration](/docs/advanced/configuration). Note: some events like `messageContent` may require privileged intents to be toggled on in your bot's Discord application settings.

Privileged intents include `GUILD_PRESENCES` and `GUILD_MEMBERS`, which cover events related to guild members' presence and activities. To enable these, you need to:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Navigate to the "Bot" section
4. Scroll down to the "Privileged Gateway Intents" section
5. Toggle on the intents you need

## Common Event Names 📜

For a complete list of event names, check out this handy [Event Names Cheat Sheet](https://gist.github.com/Iliannnn/f4985563833e2538b1b96a8cb89d72bb). Remember, you don't need to use `client.on` like the examples in the sheet—just create a file named after the event!

## Robo Lifecycle 🔄

In Robo.js, we've got some special events to give you an extra level of control over your bot's shenanigans: `_start`, `_stop`, and `_restart`. Each one of these handy events receive the `client` object as a parameter.

Here's the lowdown: `_start` gets called _before_ your bot has logged in. You can return a Promise in these events and Robo.js will patiently wait for them to finish up, but don't leave it hanging too long – there's a 5-second time limit. <!-- [Check out the details on timeouts here](/docs/advanced/configuration#timeouts). -->

Use these lifecycle events to tidy up or get things ready for your Robo's grand entrance or exit. Perhaps you need to fire up an API server or disable buttons while your bot's snoozing.
