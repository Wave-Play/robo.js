# 🐛 Debugging

No code is perfect, and bugs are just part of the programming journey. But don't sweat it! Robo.js has got your back with nifty built-in features to help you squash those pesky bugs.

When you run Robo.js in development mode, it might reply with errors containing helpful info like the command/event/plugin that messed up, a stack trace, interactive Robo logs, and even a sneak peek at the exact code!

## Setting Up a Test Server 🏠

We totes recommend creating a personal Discord server for your Robo to chill in. Just add your server's ID as an environment variable called `DISCORD_GUILD_ID`.

Doing this means command updates will only show up in this cool server during development mode. Plus, you'll unlock the special debugging features mentioned here for this server only.

:::info

#### Check out [Secrets](/docs/basics/secrets) for more

:::

## Sage Error Replies 🔮

Your Robo's got a secret weapon: the Sage suite! When there's an error during code execution, Sage will make your Robo automatically reply with an error message. It's got your back for things like trying to send a message to a non-existing channel, reacting with an emote the bot can't access, missing permissions, and more.

Sage will spill the tea in the same channel that triggered the error, like where the faulty command went down. These error replies come packed with deets like the exact file and code that caused the issue, a snapshot of the logs leading up to it, a stack trace, and all that jazz.

You can turn off Sage error replies in the config file if you want. Here's an example of how to do it:

```javascript title="config/robo.mjs" showLineNumbers {3-5}
export default {
	// ... the rest of your config
	sage: {
		errorReplies: false
	}
}
```

:::info

Check out **[Sage Documentation](/docs/basics/sage)** to learn more about the Sage suite and its awesome features

:::

## Logging 📝

Logging is like the bread and butter of debugging. You can use JavaScript's built-in `console.log` or the special `logger` object from `robo.js` – they work the same way. The difference is that logs made with the `logger` object will show up in your Robo's `/dev` command and error replies.

Wanna customize your log levels? Each log has a priority level that you can toggle on or off in the config.

```javascript title="config/robo.mjs" showLineNumbers {3-5}
export default {
	// ... the rest of your config
	logger: {
		level: 'debug' // This shows *all* the logs
	}
}
```

Log levels and their priority values look like this:

- debug: 1
- info: 2
- wait: 2
- other: 2
- event: 3
- warn: 4
- ready: 5
- error: 5

So, setting `level` to `debug` (priority 1) will show all logs with a greater value, `info` (priority 2) is the default, and setting it to `error` (priority 5) will only show error logs and logs with a priority value of 5.

:::tip

Dive into [Advanced Configuration](/docs/advanced/configuration) for more info on the config file and its values

:::

## Handling Async Errors ⏰

Sometimes your Robo runs into errors in async code that are out of your control. By default, it'll crash, and you'll need to restart it.

The smart move is to handle async errors yourself. You can stop these crashes from happening by awaiting promises and handling the errors, like this:

```javascript showLineNumbers {6-10}
// Oopsie: This will crash your Robo in development mode
// In production mode and debug channels, the error will be shown instead
message.react('👍')

// Yay: Using try/catch and await helps you handle the error
try {
	await message.react('👍')
} catch (error) {
	console.error('Failed to react with 👍:', error)
}
```

This way, your Robo can gracefully handle any unexpected async errors and keep running smoothly.

If you're feeling overwhelmed, you can set up a debug channel to catch these errors and let you focus on your work. Just add the `DISCORD_DEBUG_CHANNEL_ID` environment variable with your debug channel ID. Keep in mind, this shouldn't be a permanent solution, and you should still address these errors.

## The Nifty /dev Command 🔧

Your Robo's got a built-in `/dev` command you can whip out in Discord to peep Robo logs, system info, and more. It's super handy for debugging 'cause it gives you speedy access to all the juicy deets about your Robo's inner workings.

Wanna turn off this command? No prob. Just tweak the config file by setting it to `false`. Or, you can flex your creative muscles and cook up your own `dev` command to overwrite the default one.

```javascript showLineNumbers title="config/robo.mjs"
export default {
	// ... the rest of your config vibes
	override: {
		commands: {
			dev: false
		}
	}
}
```

:::note

**Heads up:** The **`/dev` command** is only up for grabs when your Robo's in development mode and chilling in your test server.

:::

## Debugging Events 🎉

Events can be a bit trickier to debug than commands since they're not manually triggered by you. But don't worry! Robo.js has a solution for that, too.

Whenever an event is emitted, you can see the exact code that's executed in the `/dev` command in your test server. This way, you can quickly find any issues related to the event.

Happy debugging! 🐛
