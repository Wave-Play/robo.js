# 🚀 @roboplay/plugin-ai

This plugin morphs your **[Robo](https://github.com/Wave-Play/robo.js)** into a sophisticated AI chatbot. By simply mentioning it or replying to its messages on Discord, you initiate a natural conversation - as if you're chatting with a fellow human!

> 🔑 To bring this magic to life, secure an **[OpenAI API key](https://openai.com/)**. Set it as an environment variable named `OPENAI_API_KEY`, and your Robo is good to go.

## Installation 💻

To add this amazingness to your Robo, just use this spell (I mean, command):

```bash
npx robo add @roboplay/plugin-ai
```

And there you go! Your Robo, now powered by AI, is ready to have a chat!

New to Robo.js? Start your project with this plugin pre-installed:

```bash
npx create-robo <project-name> -p @roboplay/plugin-ai
```

## Your Robo's Personality 🧬

Desire a Robo with a backstory, specific character traits, or a distinctive personality? Tell it a story with the `systemMessage` config:

```js
// config/plugins/roboplay/plugin-ai.mjs
export default {
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

For those who like to tinker and build, this plugin also exposes a JavaScript API to enhance things even further!

```js
import { AI } from '@roboplay/plugin-ai'

// Prompt a chat query and obtain the AI's response.
AI.chat()

// Be the puppeteer! Control AI events or alter certain values.
AI.on()

// Disconnect from an AI event.
AI.off()
```

We've also got some handy AI tools for you to use:

- `selectOne`: Match strings semantically from a range of choices.
- `chat`: A low-level variant of `AIEngine.chat()` for direct OpenAI API interactions.

And guess what? With tools like these, other cool plugins like `@roboplay/plugin-ai-voice` let your Robo chat in voice channels too!

## Voice Capabilities 🎙️

If you've added the `@roboplay/plugin-ai-voice` to your Robo, you're in for a treat! This AI plugin will let your Robo talk in voice channels!

```bash
npx robo add @roboplay/plugin-ai-voice
```

How cool is that? Your Robo can now talk to you in voice channels, just like a real person!

## Web API 🌐

Now, if you've added the `@roboplay/plugin-api` to your Robo, there's another treat waiting. This AI plugin will unveil a shiny new `/api/ai/chat` path, letting your Robo have fun chats on websites!

```bash
npx robo add @roboplay/plugin-api
```

Imagine a chat window with your Robo on your favorite webpage. Pretty cool, right?

## Custom Models 🧪

You can also use your own custom AI models with this plugin. Just set the `model` config your custom model instance and you're good to go!

```js
// config/plugins/roboplay/plugin-ai.mjs
import LlamaModel from '../../../llama.js'

export default {
	// ... other configurations
	model: new LlamaModel()
}
```

Custom models must extend the `BaseEngine` class from `@roboplay/plugin-ai`. Here's a quick example:

```js
// llama.js
import { BaseEngine } from '@roboplay/plugin-ai'

export default class LlamaModel extends BaseEngine {
	async chat(query) {
		return `Llama says: ${query}`
	}
}
```

> **Warning:** The custom model API is still in beta. It may change in the future.
