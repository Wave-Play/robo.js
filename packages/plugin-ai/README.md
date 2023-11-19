# 🚀 @roboplay/plugin-ai

This plugin morphs your **[Robo](https://github.com/Wave-Play/robo.js)** into a sophisticated AI chatbot. By simply mentioning it or replying to its messages on Discord, you initiate a natural conversation - as if you're chatting with a fellow human!

🔑 To bring this magic to life, secure an **[OpenAI API key](https://openai.com/)**. Once in hand, slide it into the `openaiKey` slot of your plugin config, and your Robo is good to go.

## Installation 💻

To add this amazingness to your Robo, just use this spell (I mean, command):

```bash
npx robo add @roboplay/plugin-ai
```

And there you go! Your Robo, now powered by AI, is ready to have a chat.

## Your Robo's Personality 🧬

Desire a Robo with a backstory, specific character traits, or a distinctive personality? Tell it a story with the `systemMessage` config:

```js
// config/plugins/roboplay/plugin-ai.mjs
export default {
	openaiKey: process.env.OPENAI_API_KEY, // Your special key here
	systemMessage: 'You are Batman, protector of the Weeb City Discord server.'
}
```

## Let's _Talk_ Commands 🗣️

Command your AI Robo in everyday language! Got a `/ban` command? Just say, _"Robo, ban @naughtyAlien for space spamming!"_, and it'll happen. And don't worry, your Robo will only listen to folks with the right permissions (roles).

**Always ensure your slash commands' permissions are configured correctly, whether you use this or not! 🛡️**

> 💡 **By the way...** If you ever want to turn this off, just set the `commands` config field to `false`.

## Special Channels 📜

You can make special channels where Robo will chat freely, without always being called out. Just use the `whitelist` config:

```js
export default {
	// Other configurations...
	whitelist: {
		channelIds: ['channelID1', 'channelID2']
	}
}
```

## Config file 🧠

Here's a quick look at all the settings you can play with:

```js
// config/plugins/roboplay/plugin-ai.mjs
export default {
	// Set this with your OpenAI key! (string) (required)
	openaiKey: 'YOUR_OPENAI_API_KEY',

	// Model for your AI. You might stick with the default. (string)
	model: 'gpt-3.5-turbo',

	// Tell your Robo a backstory or role. (string)
	systemMessage: 'You are a wise wizard of Webland!',

	// Let Robo use or ignore specific commands. true for all commands, false for no commands, array for only specific commands. (boolean or string array)
	commands: ['ban', 'kick', 'dev logs'],

	// Special channels where Robo talks freely. (object with array of string IDs)
	whitelist: {
		channelIds: ['channelID1', 'channelID2']
	}
}
```

## JavaScript API 🧰

For those who like to tinker and build:

- `AIEngine.chat()`: Prompt a chat query and obtain the AI's response.
- `AIEngine.on()`: Be the puppeteer! Control AI events or alter certain values.
- `AIEngine.off()`: Disconnect from an AI event.
- `selectOne`: Match strings semantically from a range of choices.
- `chat`: A low-level variant of `AIEngine.chat()` for direct OpenAI API interactions.

And guess what? With tools like these, other cool plugins like `@roboplay/plugin-ai-voice` let your Robo chat in voice channels too!

## Web API 🌐

Now, if you've added the `@roboplay/plugin-api` to your Robo, there's another treat waiting. This AI plugin will unveil a shiny new `/api/ai/chat` path, letting your Robo have fun chats on websites!

Imagine a chat window with your Robo on your favorite webpage. Pretty cool, right?
