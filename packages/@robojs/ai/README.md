<p align="center">✨ <strong>Generated with <a href="https://roboplay.dev/create-robo">create-robo</a> magic!</strong> ✨</p>

---

# @robojs/ai

Transform your Robo into an AI-powered copilot with native voice, vision, web search, natural language command execution, token usage tracking, and a pluggable engine architecture. Ships with OpenAI's Responses + Conversations APIs by default while staying ready for custom providers.

<div align="center">
  <a href="https://github.com/Wave-Play/robo/blob/main/LICENSE"><img alt="GitHub license" src="https://img.shields.io/github/license/Wave-Play/robo" /></a>
  <a href="https://www.npmjs.com/package/@robojs/ai"><img alt="npm" src="https://img.shields.io/npm/v/@robojs/ai" /></a>
  <a href="https://packagephobia.com/result?p=@robojs/ai@latest"><img alt="install size" src="https://packagephobia.com/badge?p=@robojs/ai@latest" /></a>
  <a href="https://roboplay.dev/discord"><img alt="Discord" src="https://img.shields.io/discord/1087134933908193330?color=7289da" /></a>
  <a href="https://github.com/Wave-Play/robo.js/blob/main/CONTRIBUTING.md#contributors"><img alt="All Contributors" src="https://img.shields.io/github/all-contributors/Wave-Play/robo.js?color=cf7cfc" /></a>
</div>

➞ [📚 **Documentation:** Getting started](https://robojs.dev/docs/getting-started)

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)

## 💻 Installation

```bash
npx robo add @robojs/ai
```

New project? Scaffold with the plugin already wired up:

```bash
npx create-robo my-robo -p @robojs/ai
```

> 💡 **Voice dependencies** are optional. Install `@discordjs/voice`, `prism-media`, and an Opus encoder such as `opusscript` or `@discordjs/opus` if you plan to use voice conversations. The plugin loads them lazily when a voice session starts.

> [!IMPORTANT] Set `OPENAI_API_KEY` (or your provider's equivalent) in the environment so the default OpenAI engine can authenticate.

## 💬 Interacting with Your AI Robo

- **Mentions:** Ping the bot anywhere. Example: `@Sage what's the schedule for tonight?`
- **Replies:** Continue threads by replying to any bot message—no extra mention required.
- **Whitelisted Channels:** Configure channels for ambient chatting without mentions.
- **Direct Messages:** DM the bot and it will respond automatically.

```ts
// config/plugins/robojs/ai.mjs
export default {
  whitelist: {
    channelIds: ['123456789012345678', '234567890123456789']
  },
  restrict: {
    channelIds: ['345678901234567890']
  }
}
```

> ⚠️ Channel restrictions always win: if `restrict` is provided, the bot ignores messages from channels not listed—even if they are in the whitelist.

## 🌱 Seed Commands

During `npx robo add @robojs/ai` you can optionally scaffold slash commands. They are yours to keep, tweak, or delete.

- **`/ai chat`** (`seed/commands/ai/chat.ts`)
  - Quick, prompt-based conversations without mentioning the bot.
  - Example: ``/ai chat message:"What's the capital of France?"``
- **`/ai imagine`** (`seed/commands/ai/imagine.ts`)
  - Text-to-image generation powered by your configured engine.
  - Example: ``/ai imagine prompt:"A serene mountain landscape at sunset"``
- **`/ai usage`** (`seed/commands/ai/usage.ts`)
  - Token usage dashboard (requires Manage Server). Displays daily, weekly, monthly, and lifetime totals plus configured caps.
- **`/voice join`** (`seed/commands/voice/join.ts`)
  - Summons the bot into a voice channel for realtime conversation.
  - Example: ``/voice join channel:"General"``

> 💡 Seed scripts only bootstrap starter flows. The bot continues to answer mentions, replies, DMs, and whitelisted channels even if you remove them.

## 👁️ Vision Capabilities

Vision-enabled models (e.g., `gpt-4o`, `gpt-4.1`, `gpt-5`, `o1`, `o3`) automatically understand images.

- **Discord attachments** are converted to image URLs and forwarded to the engine.
- **Message content URLs** with images are processed as additional inputs.
- **No extra config** required—choose a vision-capable model and you're done.

Example conversation:

```
User: @Sage can you describe this?
[uploads photo of a coffee setup]
Bot: That looks like a pour-over coffee station with a glass carafe and ceramic dripper. The beans are medium roast...
```

Programmatic vision call:

```ts
import { AI } from '@robojs/ai'

await AI.chat(
  [
    {
      role: 'user',
      content: [
        { type: 'text', text: 'What do you see in this image?' },
        {
          type: 'image_url',
          image_url: { url: 'https://example.com/desk-setup.jpg' }
        }
      ]
    }
  ],
  {
    onReply: ({ text }) => console.log(text)
  }
)
```

> [!NOTE] The engine detects capability via `isVisionCapableModel()` and falls back gracefully for models that cannot process images.

## 🔍 Web Search & Citations

Enable live web context with built-in citation formatting when using the OpenAI engine.

```ts
import { OpenAiEngine } from '@robojs/ai/engines/openai'

export default {
  engine: new OpenAiEngine({
    webSearch: true
  })
}
```

When active, responses embed inline markers like `[1]` and append a `Sources:` footer with clickable links.

```
The latest LTS release of Node.js is 20.x [1], which introduces performance
improvements to the web streams API [2].

Sources:
[1] Node.js – https://nodejs.org
[2] Release Notes – https://nodejs.org/en/blog/release
```

> 💡 Citations are injected via `injectCitationMarkers()` and rendered with `formatSourcesLine()`—no extra formatting needed on your end.

## ✨ Features

- 💬 Natural Discord conversations with mentions, replies, DMs, and channel whitelists.
- 🎙️ Native voice conversations with realtime transcription and playback.
- 👁️ Vision-aware chats that understand images and URLs.
- 🔍 Optional web search with automatic citations.
- 🛠️ Natural language command execution mapped to your slash commands.
- 📊 Token usage tracking with configurable rate limits.
- 📚 Knowledge sync via vector stores sourced from `/documents`.
- 🖼️ Image generation for creative prompts.
- 🔌 Extensible engine API to plug in other model providers.
- 🌐 REST endpoint (`/api/ai/chat`) for web integrations (requires `@robojs/server`).

## 🧠 Configuration

### Basic Plugin Options

`PluginOptions` live in `config/plugins/robojs/ai.(mjs|ts)`:

- `instructions` – System prompt or persona description.
- `commands` – `true`, `false`, or string array allow list for natural language command execution.
- `insight` – Enable `/documents` sync for vector search (default `true`).
- `restrict` – Limit responses to specific channel IDs.
- `whitelist` – Allow mention-free chat in selected channels.
- `engine` – Instance of any `BaseEngine` subclass.
- `voice` – Voice configuration overrides.
- `usage` – Token ledger settings (limits, alerts, hooks).

```ts
import { OpenAiEngine } from '@robojs/ai/engines/openai'

export default {
  instructions: 'You are Sage, a friendly community mentor who answers succinctly.',
  commands: ['ban', 'kick', 'ai log'],
  insight: true,
  restrict: { channelIds: ['123'] },
  whitelist: { channelIds: ['456', '789'] },
  usage: {
    limits: [
      {
        window: 'day',
        mode: 'alert',
        maxTokens: 200_000
      }
    ]
  },
  engine: new OpenAiEngine({
    chat: {
      model: 'gpt-4.1-mini',
      temperature: 0.6,
      maxOutputTokens: 800
    }
  })
}
```

> [!NOTE] All engines follow the same `BaseEngine` contract, so swapping providers is as simple as returning a different engine instance.

### Engine Configuration

The default `OpenAiEngine` accepts these options:

- `clientOptions` – Pass through to the OpenAI SDK (`apiKey`, `baseURL`, fetch overrides).
- `chat` – Default chat model config (`model`, `temperature`, `maxOutputTokens`, `reasoningEffort`).
- `voice` – Defaults for realtime or TTS models plus transcription settings.
- `webSearch` – Enable/disable web search tool.

```ts
new OpenAiEngine({
  clientOptions: {
    apiKey: process.env.OPENAI_API_KEY,
    organization: process.env.OPENAI_ORG_ID
  },
  chat: {
    model: 'gpt-5-preview',
    reasoningEffort: 'medium',
    temperature: 0.2,
    maxOutputTokens: 1200
  },
  voice: {
    model: 'gpt-4o-realtime-preview',
    transcription: {
      model: 'gpt-4o-transcribe-latest',
      language: 'en'
    }
  },
  webSearch: true
})
```

> 💡 Use reasoning models (`o1`, `o3`, `gpt-5`) for complex planning; standard models (`gpt-4o`, `gpt-4.1-mini`) keep responses fast and vision-ready.

> [!NOTE] Image generation is available via `AI.generateImage(options)`; engine-level defaults for images are not currently configurable through the constructor.

## 🎙️ Voice Features

Voice support is built-in—no extra plugin required.

- `enabled` – Toggle voice globally (defaults to `true`).
- `endpointing` – Choose `'server-vad'` (automatic voice activity detection) or `'manual'` (explicit end-of-turn control).
- `model` – Override the realtime model.
- `playbackVoice` – Select the TTS voice ID.
- `maxConcurrentChannels` – Limit simultaneous guild sessions.
- `instructions` – Voice-specific system prompt.
- `capture` – Audio capture config (`channels`, `sampleRate`, `silenceDurationMs`, `vadThreshold`).
- `playback` – Output sampling configuration.
- `transcript` – Embed transcripts (guild channel ID, enable flag).
- `perGuild` – Override any of the above per guild.

```ts
export default {
  voice: {
    endpointing: 'server-vad',
    maxConcurrentChannels: 2,
    playbackVoice: 'alloy',
    instructions: 'Keep spoken replies upbeat and under 8 seconds.',
    capture: {
      sampleRate: 48000,
      silenceDurationMs: 600,
      vadThreshold: 0.35
    },
    transcript: {
      enabled: true,
      targetChannelId: '987654321098765432'
    },
    perGuild: {
      '123456789012345678': {
        playbackVoice: 'verse'
      }
    }
  }
}
```

Voice lifecycle events (`session:start`, `session:stop`, `config:change`, `transcript:segment`) are available via `AI.onVoiceEvent`. Transcript embeds require `CONNECT`, `SPEAK`, and `SEND_MESSAGES` permissions.

> [!TIP] `server-vad` is recommended—it automatically trims silence and hands conversations back to the model without manual end markers.

## 📊 Token Usage & Limits

Token accounting is handled by the `tokenLedger` singleton.

- Records usage for every AI call (chat, voice, image, custom tools).
- Groups stats by window: `day`, `week`, `month`, `lifetime`.
- Enforces limits in `block` mode (throws) or `alert` mode (emits events).
- Tracks per-model totals, ideal for budgeting across models/providers.

```ts
export default {
  usage: {
    limits: [
      {
        window: 'month',
        mode: 'block',
        maxTokens: 1_000_000,
        models: ['gpt-4o', 'gpt-4o-mini']
      },
      {
        window: 'day',
        mode: 'alert',
        maxTokens: 200_000
      }
    ]
  }
}
```

```ts
import { AI, tokenLedger, TokenLimitError } from '@robojs/ai'

try {
  await AI.chatSync(
    [{ role: 'user', content: 'Summarize the meeting notes.' }],
    {}
  )
} catch (error) {
  if (error instanceof TokenLimitError) {
    // Notify admins or throttle usage
  }
}

const weekly = await AI.getUsageSummary({ window: 'week' })
const lifetime = tokenLedger.getLifetimeTotals()
```

Usage events:

```ts
tokenLedger.on('usage.recorded', payload => {
  console.log('Usage recorded:', payload)
})

tokenLedger.on('usage.limitReached', payload => {
  // Alert your team via webhook/DM
})
```

> ⚠️ Exceeding a `block` mode limit throws `TokenLimitError`; the `/ai usage` command helps server admins monitor usage directly inside Discord.

## 🧰 JavaScript API Reference

### AI Singleton

- `AI.chat(messages: ChatMessage[], options: ChatOptions)` – Streaming conversation helper acknowledging Discord context. `messages` is the array of chat turns (system, user, assistant). `options` extends engine chat settings with Discord context and requires `onReply`.
- `AI.chatSync(messages: ChatMessage[], options: Omit<ChatOptions, 'onReply'>)` – Promise that resolves with the first assistant reply, suitable for HTTP handlers or scripts.
- `AI.generateImage(options)` – Image creation via configured engine.
- `AI.isReady()` – Checks engine initialization state.
- `AI.getActiveTasks(channelId?)` – Returns active background task snapshots.

### Voice Controls

- `AI.startVoice({ guildId, channelId, textChannelId? })`
- `AI.stopVoice({ guildId, channelId? })`
- `AI.setVoiceConfig({ patch, guildId? })`
- `AI.getVoiceStatus(guildId?)`
- `AI.getVoiceMetrics()`
- `AI.onVoiceEvent(event, listener)` / `AI.offVoiceEvent(event, listener)`

### Usage Tracking

- `AI.getUsageSummary(query)` – Aggregated usage per window.
- `AI.getLifetimeUsage(model?)` – Lifetime totals.
- `AI.onUsageEvent(event, listener)` / `AI.onceUsageEvent(event, listener)` / `AI.offUsageEvent(event, listener)`.

### Token Ledger Direct Access

- `tokenLedger.recordUsage(entry)`
- `tokenLedger.getSummary(query)`
- `tokenLedger.getLifetimeTotals(model?)`
- `tokenLedger.configure(config)`
- `tokenLedger.getLimits()` / `tokenLedger.setLimits(limits)`
- `tokenLedger.getLimitState(model?)`

## 🗣️ Command Execution

Natural language commands are routed to your registered slash commands via tool calls.

- Permission checks mimic Discord's native rules (roles, DM ban lists).
- Sage deferral kicks in after `deferBuffer` (default 3s) to avoid interaction timeouts.
- Background jobs show typing indicators and follow-up messages until completion.

```ts
// Example snippet from a custom tool handler
AI.chat(messages, {
  channel,
  member,
  onReply: reply => {
    if (reply.type === 'command-executed') {
      console.log('Command dispatched:', reply.command)
    }
  }
})
```

> [!IMPORTANT] Keep your slash command permissions in sync. The AI respects them but cannot override Discord's permission model.

## 📚 Insights (Vector Store)

- Drop files into `/documents` and Robo syncs them to a vector store on startup.
- Supports all file types listed in [OpenAI file search docs](https://platform.openai.com/docs/assistants/tools/file-search/supported-files).
- Hash-based diffing uploads only changed files.
- Disable by setting `insight: false` in the plugin config.

```ts
export default {
  insight: false
}
```

> 💡 Remind the bot to reference key documents by mentioning them in `instructions` for higher recall accuracy.

## 🌐 Web API

Pair with `@robojs/server` to expose REST endpoints.

```
POST /api/ai/chat
```

- Request body: `{ messages: ChatMessage[] }`
- Response body: `{ message: string }`

```ts
// src/api/ai/chat.ts
import { AI } from '@robojs/ai'
import type { ChatMessage } from '@robojs/ai'
import type { RoboRequest } from '@robojs/server'

export default async function handler(req: RoboRequest) {
  const { messages } = await req.json<{ messages: ChatMessage[] }>()

  if (!messages?.length) {
    return { message: '' }
  }

  const reply = await AI.chatSync(messages, {})

  return { message: reply.text ?? '' }
}
```

> [!NOTE] Install `@robojs/server` via `npx robo add @robojs/server` to enable the route.

## 🔌 Custom Engine Development

Create your own engine by extending the abstract base class.

```ts
import { BaseEngine } from '@robojs/ai'
import type {
  ChatOptions,
  ChatResult,
  VoiceSessionHandle,
  VoiceSessionStartOptions
} from '@robojs/ai/engines/base'

class MyEngine extends BaseEngine {
  async init() {
    // Warm up connections, perform auth
  }

  async chat(options: ChatOptions): Promise<ChatResult> {
    // Call your provider and return the assistant response
    return {
      messages: [
        {
          role: 'assistant',
          content: 'Hello from a custom provider!'
        }
      ]
    }
  }

  supportedFeatures() {
    return {
      voice: false,
      image: true,
      webSearch: false
    }
  }
}

export default new MyEngine()
```

Mandatory methods: `init()`, `chat()`, `supportedFeatures()`. Optional overrides include `generateImage()`, `startVoiceSession()`, `stopVoiceSession()`, and `summarizeToolResult()`. Engines emit hooks via `engine.on(event, listener)` if you want to observe chat flow or tool usage.

> [!TIP] The engine lifecycle is production ready—use it to integrate Azure OpenAI, Anthropic, Llama, or on-prem solutions.

## 🛠️ Troubleshooting

- **Missing voice audio** – Confirm optional voice dependencies are installed and the bot has `CONNECT` + `SPEAK` permissions.
- **Bot ignores channels** – Check `restrict` and `whitelist` configuration; `restrict` takes precedence.
- **TokenLimitError thrown** – You exceeded a `block` mode limit. Lower usage or switch to `alert`.
- **High latency** – Large insight datasets can slow responses; prune `/documents` or increase engine model speed (e.g., `gpt-4.1-mini`).
- **Voice quality issues** – Tune `capture.sampleRate` and `endpointing` strategy. `server-vad` smooths out long silences.
- **Transcript embeds missing** – Ensure the transcript channel exists and the bot can send messages there.

> [!HELP] Still stuck? Enable debug logging via `ROBO_LOG_LEVEL=debug` and watch for detailed engine traces.

## 🤔 Got questions?

If you need help, hop into our community Discord. We love to chat, and Sage (our resident AI Robo) is always online to assist.

➞ [🚀 **Community:** Join our Discord server](https://roboplay.dev/discord)
