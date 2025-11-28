# @robojs/ai – Agent Notes

> **Keep this living.** Any time a public API, engine workflow, or configuration surface changes, circle back and update this brief so the next pass isn’t working with stale intel.

## Mission & Scope
- Ships the AI chatbot experience for Robo. Handles Discord conversations, slash-command bridging, background tool execution, and (optionally) web/voice front ends.
- Voice is native: realtime capture/transcription/playback lives in this package.
- Default engine is OpenAI Responses + Conversations; engine contract allows custom providers.
- Integrates with the broader Robo ecosystem (Flashcore, portal commands, Sage deferral, @robojs/server).

## Lifecycle & Boot
- Entry: `src/events/_start.ts` captures plugin options (`instructions`, `commands`, `restrict`, `whitelist`, `insight`, `engine`, `voice`).
- If `engine` is omitted and `OPENAI_API_KEY` exists, it lazily `import()`s `OpenAiEngine` at runtime instead of bundling it eagerly.
- Insights default to `true`; they wire the `/documents` vector store sync.
- On successful `engine.init()` the plugin calls `setEngineReady()` and logs “AI is ready!”.

## Public Surface (`src/index.ts`)
- Re-exports the `AI` singleton, all `BaseEngine` types, and the `PluginOptions` interface.
- Downstream consumers: other plugins, web API handlers, internal commands.

## AI Singleton (`src/core/ai.ts`)
- `AI.chat` – streaming reply flow; enriches messages with system persona, active task context, drained tool digests. Handles typing indicators, command routing, background tasks.
- `AI.chatSync` – Promise wrapper resolving on the first reply chunk.
- `AI.generateImage` – Pass-through to engine image endpoint.
- `AI.getActiveTasks` – Snapshot of in-flight tool jobs per channel.
- `AI.isReady` – Frontend indicator once engine init completes.
- Channel management methods for runtime configuration:
  - `addWhitelistChannel(channelId)` / `removeWhitelistChannel(channelId)` – Dynamically manage whitelist
  - `addRestrictChannel(channelId)` / `removeRestrictChannel(channelId)` – Dynamically manage restrict list
  - `getWhitelistChannels()` / `getRestrictChannels()` – Query current channel lists
  - Runtime changes are not persisted; config file takes precedence on restart.
- All public calls now short-circuit (and log once) if no engine is configured; `AI.chatSync` rejects in that scenario so slash commands surface the error.
- Voice controls exposed from `core/ai.ts`:
  - `startVoice({ guildId, channelId, textChannelId?, deaf?, mute? })`
  - `stopVoice({ guildId, channelId? })`
  - `setVoiceConfig({ patch, guildId? })`
  - `getVoiceStatus(guildId?)` / `getVoiceMetrics()`
  - `onVoiceEvent` / `offVoiceEvent` for `'session:start' | 'session:stop' | 'config:change' | 'transcript:segment'`.
- Token usage tracking exposed from `core/token-ledger.ts`:
  - `tokenLedger.recordUsage({ model, tokensIn, tokensOut, metadata?, kind? })`
  - `tokenLedger.getSummary({ model?, window?, range?, cursor?, limit? })`
  - `tokenLedger.getLifetimeTotals(model?)`
  - `tokenLedger.configure({ limits?, hooks? })`
  - `tokenLedger.getLimitState(model)` / `tokenLedger.assertWithinLimit(model, kind?)`
  - `tokenLedger.on` / `tokenLedger.once` / `tokenLedger.off` for `'usage.recorded' | 'usage.limitReached'` events.
- Usage tracking methods on AI singleton:
  - `getUsageSummary(query)` / `getLifetimeUsage(model?)`
  - `onUsageEvent` / `onceUsageEvent` / `offUsageEvent` for usage event listeners.

### Background Task + Tool Digest Pipeline
- `scheduleToolExecution` dispatches function calls via `tool-runner` and registers tasks for UX (typing loop + “hang tight” messages).
- `ToolDigest` queue (per-channel map) feeds into the next model turn via `withTaskContext`.
- `registerBackgroundTask` / `completeBackgroundTask` maintain the typing heartbeat and ephemeral visibility rules.
- `buildDeferredNotice` crafts the user-facing placeholder when a tool defers or exceeds the Sage buffer.

### Command Bridging
- Tool calls map back to `portal.commands` handlers; respects DM permissions, role checks, and whitelists.
- `getCommandReply` uses the mock interaction harness to execute slash commands. Auto-defers after `Sage.deferBuffer` milliseconds (default 3000) if the promise hasn’t settled.
- Mock interaction traps `reply`, `editReply`, `deferReply`, and synthesizes `replyPromise` so command authors can use standard Discord.js patterns without hanging the tool runner.

## Engines Architecture
- `BaseEngine` (`src/engines/base.ts`) defines the abstract surface: `chat`, `generateImage`, `getFunctionHandlers`, `summarizeToolResult?`, hook support, etc.
- `OpenAiEngine` (`src/engines/openai/engine.ts`):
  - Manages Conversations API state via Flashcore (conversation IDs, summaries, history tails).
  - Builds toolsets (Discord command functions + optional file search) and rotates conversation IDs after tool calls.
  - Syncs `/documents` into a vector store when insights enabled; uploads diffs, purges stale files.
  - Optionally summarizes tool results via “shadow” Responses call for cleaner digest messages.
  - Supports image generation via `images.generate`.
  - Orchestrates GPT realtime sessions whenever voice is active (streaming PCM append, handling manual/server endpointing, retry w/ exponential backoff, persisting transcript tail snapshots to Flashcore).
- `AiEngine.Modes` (`src/core/engine.ts`) exposes Flashcore-backed presets (not heavily used yet).

## Event Handlers
- `events/messageCreate/chat.ts` – Gatekeeper for Discord messages (self-filter, restrict/whitelist logic, mention requirement). Normalizes mentions, folds reply-chain context, and routes to `AI.chat`.
- `events/typingStart/debounce.ts` – Currently informational logging; safe to expand if typing telemetry needed.
- `events/voiceStateUpdate/manage.ts` – Watches the bot’s voice membership; when we join/leave/move a voice channel the `voiceManager` spins up/shuts down realtime audio.

## Seed Commands & APIs
- Seed commands (optional, offered during `npx robo add @robojs/ai` installation):
  - `/ai chat` (`seed/commands/ai/chat.ts`) – Direct chat command using `AI.chatSync`. Accepts `message` option.
  - `/ai imagine` (`seed/commands/ai/imagine.ts`) – Image generation command with `TokenLimitError` handling. Accepts `prompt` option.
  - `/ai usage` (`seed/commands/ai/usage.ts`) – Token usage dashboard showing daily/weekly/monthly/lifetime totals with pagination. Requires Manage Server permission.
  - `/voice join` (`seed/commands/voice/join.ts`) – Join voice channel command. Accepts optional `channel` option.
- Web endpoint `/api/ai/chat` (`src/api/ai/chat.ts`) – Requires `@robojs/server`; injects system message if absent and streams back the first reply.
- **Important:** Seed commands are completely optional. Users can delete, modify, or keep them as-is. The AI bot functions without them via mentions, replies, and whitelisted channels.

## Interaction Patterns
- Bot responds to:
  - **Mentions** – `@bot` anywhere in a message
  - **Replies** – Replying to any bot message continues the conversation
  - **Whitelisted channels** – All messages in configured `whitelist` channels (no mention needed)
  - **Direct Messages** – All DMs are processed automatically
- Respects channel restrictions via `restrict` config option (channel ID array or boolean)
- Message processing in `events/messageCreate/chat.ts` handles:
  - Self-message filtering (ignores bot's own messages)
  - Restriction/whitelist logic
  - Mention requirement enforcement
  - Reply chain context loading (via `getReplyChain` with 'context' or 'reference' modes)
  - Surrounding context fetching (via `getSurroundingContext`) when mentioned in regular channels
  - Mention normalization (replaces Discord mentions with readable usernames)
  - Username-to-ID mapping for restoring mentions in bot replies
- **Surrounding Context** (enabled by default):
  - When the bot is mentioned in a regular channel (not whitelisted/DM), it fetches recent channel messages for context
  - Context is presented as a separate system message with clear framing: "Recent channel conversation for reference. Only use this context if directly relevant to the user's question"
  - Default depth: 8 messages (configurable via `context.depth`)
  - Automatically excludes messages already in reply chains to avoid duplication
  - Can be disabled via `context.enabled: false`

## Vision Capabilities
- Vision-capable models automatically support image understanding:
  - Supported models: `gpt-4o`, `gpt-4.1`, `gpt-5`, `o1`, `o3`, and variants containing `vision`, `omni`, or `gpt-5-codex` in the name
  - Detection via `isVisionCapableModel()` helper using `VISION_MODEL_HINTS` constant
- Image processing:
  - Discord image attachments are automatically converted to image URLs and included in message content
  - Image URLs in message content are processed when using vision-capable models
  - Message content can be string or array with `{ type: 'text' | 'image_url', ... }` objects
- Implementation in `events/messageCreate/chat.ts`:
  - `getMessageContent()` checks `engine.supportedFeatures().vision`
  - Extracts image URLs from message attachments when vision is supported
  - Returns content as array with text and image_url objects
- **No additional configuration needed** – works automatically when using vision-capable models

## Web Search & Citations
- OpenAI engine supports web search tool via `webSearch: true` option in constructor:
  ```typescript
  new OpenAiEngine({ webSearch: true })
  ```
- When enabled:
  - Responses include inline citation markers: `[1]`, `[2]`, `[3]`, etc.
  - A "Sources:" footer is automatically appended with clickable markdown links
  - Citations reference web sources used to generate the response
- Implementation in `engines/openai/engine.ts`:
  - `injectCitationMarkers()` – Processes `ResponseOutputText` chunks with URL annotations, inserting numbered markers at annotation boundaries
  - `createCitationContext()` – Deduplicates citations by URL+title, assigns sequential indices
  - `formatSourcesLine()` – Builds "Sources: [Label](URL), ..." footer from citation context
  - `sanitizeCitationLabel()` – Extracts readable labels from titles or hostnames, limited to 60 chars
  - `collectMessageText()` – Aggregates text fragments with citation markers from message content array
- Citation context is built from `ResponseOutputText.URLCitation` annotations returned by OpenAI Responses API
- Web search is optional and can be enabled/disabled per engine configuration
- Tool is included in toolset via `buildToolset()` when `this._webSearch` flag is true

## MCP (Model Context Protocol) Support
- **Configuration**: Users can define MCP servers in plugin options via `mcpServers` array in `config/plugins/robojs/ai.ts`:
  ```typescript
  export default {
    mcpServers: [
      {
        type: 'mcp',
        server_label: 'context7',
        server_url: 'https://mcp.context7.com/mcp',
        headers: { CONTEXT7_API_KEY: process.env.CONTEXT7_API_KEY ?? '' },
        allowed_tools: ['resolve-library-id', 'get-library-docs'],
        require_approval: 'never'
      }
    ],
    mcp: {
      gracefulDegradation: true,  // Default: true
      extraRetries: 1,            // Default: 1
      baseDelayMs: 500,            // Default: 500
      maxDelayMs: 2000             // Default: 2000
    }
  }
  ```
- **How it works**: MCP tools are server-side proxied by OpenAI—the engine passes MCP configs in the tools array, OpenAI executes them remotely, and results are incorporated into responses automatically. No local execution or special handling needed.
- **Error handling and graceful degradation**: 
  - When MCP tools are present and the Responses API call fails with retryable network errors (after the OpenAI SDK's built-in retries), the engine performs additional retry attempts with exponential backoff.
  - If retries with MCPs still fail and `gracefulDegradation` is enabled (default: true), the engine automatically removes MCP tools from the request and retries once more.
  - When degradation occurs, a status note is injected into the instructions informing the model that certain external tools were unavailable, ensuring the AI can transparently communicate this to users.
  - This prevents entire requests from failing due to transient MCP server issues while maintaining user awareness of tool unavailability.
- **Engine support**: MCP is currently implemented in `OpenAiEngine` via `buildToolset()` and can be extended to custom engines by implementing the optional `getMCPTools()` method from `BaseEngine`.
- **Limitations**: MCP tools are only available in 'worker' context (standard chat), not in 'realtime' (voice) or 'chat' (legacy) contexts, matching the pattern of web_search.
- **Integration points**: Reference `_start.ts` for plugin options loading, `base.ts` for type definitions (`MCPTool` interface), and `openai/engine.ts` for tool injection logic and error handling (`createResponseWithMcpHandling()`).

## Token Usage & Limits
- **Token Ledger Subsystem** (`core/token-ledger.ts`) provides comprehensive usage tracking:
  - Automatic recording from all AI operations (chat, voice, image generation)
  - Aggregation by time windows: `day`, `week`, `month`, `lifetime`
  - Per-model tracking with metadata support
  - Configurable limit enforcement with two modes:
    - `block` – Throws `TokenLimitError` when limit exceeded
    - `warn` – Emits `'usage.limitReached'` event without blocking

### Token Tracking Features
- **Recording:** `recordUsage({ model, tokensIn, tokensOut, metadata?, timestamp?, kind? })`
  - Returns `{ entry, totals, breaches }` with updated aggregates and limit violations
  - Persists entries to Flashcore under `@robojs/ai/tokens` namespace
  - Emits `'usage.recorded'` event with entry and totals snapshot
- **Querying:** `getSummary({ model?, window?, range?, cursor?, limit? })`
  - Supports pagination with cursor-based navigation
  - Filters by model, time range, and window type
  - Returns aggregated rows with `{ model, windowKey, totals }` structure
- **Lifetime Totals:** `getLifetimeTotals(model?)` – Returns cumulative totals across all time
- **Daily Entries:** `getEntriesForDay(dayKey)` – Retrieves raw entries for audit/playback

### Limit Configuration
- **Structure:** `TokenLimitConfig` with `perModel` mapping:
  ```typescript
  {
    perModel: {
      'gpt-4o': { window: 'day', maxTokens: 50_000, mode: 'block', message?: string }
    }
  }
  ```
- **Configuration:** `tokenLedger.configure({ limits, hooks })`
  - Sets limit rules and registers hook callbacks
  - Hooks: `onRecorded`, `onLimitReached`
- **State Queries:**
  - `getLimitState(model)` – Returns per-window remaining tokens, blocking status, and active rule
  - `willExceedLimit(model, tokens, window?)` – Pre-check before operations
  - `assertWithinLimit(model, kind?)` – Throws `TokenLimitError` if blocked

### Token Limit Error
- **Class:** `TokenLimitError` extends `Error`
  - Properties: `model`, `window`, `windowKey`, `rule`, `usageKind`
  - `displayMessage` getter for user-facing text
- **Thrown by:** `assertWithinLimit()` when `mode: 'block'` and limit exceeded
- **Handling:** Catch in command handlers and `AI.chat()` flow
  - OpenAI engine calls `assertWithinLimit()` before chat operations
  - Voice sessions handle via `handleTokenLimitBreach()` with warning callback

### Events
- **`'usage.recorded'`** – Emitted after every `recordUsage()` call
  - Payload: `{ entry, model, totals: { lifetime, windows } }`
- **`'usage.limitReached'`** – Emitted when usage breaches configured limits
  - Payload: `{ entry, model, totals, breaches: [{ model, window, exceededBy, ... }] }`
- **Listeners:** `on()`, `once()`, `off()` methods on `tokenLedger`

### Persistence & Aggregation
- **Flashcore Namespace:** `@robojs/ai/tokens`
  - `aggregates` key – Stores `{ [model]: { lifetime, windows: { day, week, month } } }`
  - `entries:YYYY-MM-DD` keys – Daily entry logs for audit trails
- **Window Keys:**
  - Day: `YYYY-MM-DD` (ISO date)
  - Week: `YYYY-Wnn` (ISO week number)
  - Month: `YYYY-MM`
- **Aggregation Logic:**
  - `updateTotals()` – Accumulates tokensIn, tokensOut, total, updatedAt
  - `applyLimits()` – Evaluates window snapshots against configured rules
  - Window key calculation: `getDayKey()`, `getWeekKey()` (ISO 8601), `getMonthKey()`

### Integration Points
- **OpenAI Engine:** Records usage after every chat/voice/image operation via `recordUsage()`
- **AI Singleton:** Exposes `getUsageSummary()`, `getLifetimeUsage()`, and usage event listeners
- **Seed Command:** `/ai usage` displays dashboard with daily/weekly/monthly/lifetime totals
- **Voice Sessions:** Token limit breaches trigger warning callbacks and session disposal

## Voice Features
- Voice is built-in and native; no separate plugin required
- Voice features stay disabled when `supportedFeatures().voice` is false; configs provided in that state are ignored with a warning
- `core/voice/manager.ts` (`VoiceManager` singleton):
  - Tracks active sessions per guild+channel via `sessions` map (keyed by `${guildId}:${channelId}`)
  - Merges base/per-guild config (Flashcore namespace `@robojs/ai/voice-config`)
  - Enforces `maxConcurrentChannels` limit per guild
  - Emits lifecycle events: `'session:start'`, `'session:stop'`, `'config:change'`, `'transcript:segment'`
  - Handles `VoiceStateUpdate` events via `handleVoiceStateUpdate()` to detect bot join/leave/move
  - Resolves transcript target channel with fallback chain: override → configured → voice channel → system channel
  - Notifies token limit breaches via `notifyLimitBreach()` with deduplication

### Voice Session Lifecycle
- `core/voice/session.ts` (`VoiceSession` class):
  - Manages individual session for a voice channel
  - **Audio Capture Pipeline:**
    - Subscribes to user Opus streams via `connection.receiver.subscribe(userId)`
    - Decodes Opus to PCM16 using `prism-media` (lazily loaded)
    - Converts stereo to mono via `toMono()` (averages channels)
    - Downsamples from 48kHz (Discord) to target rate (typically 24kHz) via `downsample()`
    - Applies VAD threshold via `calculateRms()` for client-vad endpointing
    - Pushes frames to `VoiceFrameStream` for engine consumption
  - **Playback Pipeline:**
    - Persistent PassThrough → Opus encoder → AudioResource chain
    - Rebuilds pipeline via `rebuildPlaybackPipeline()` when components die
    - Upsamples engine audio deltas from target rate to 48kHz via `upsample()`
    - Writes to PassThrough stream for Discord playback
    - Appends silence padding on final delta to prevent cutoff
  - **Speaking Event Handling:**
    - `handleSpeakingStart()` – Creates capture, implements barge-in (stops playback + interrupts engine)
    - `handleSpeakingEnd()` – For client-vad, delays capture finish to allow AfterSilence completion
  - **Capture Finalization:**
    - `finishCapture()` – Sends appropriate end markers based on endpointing strategy:
      - `server-vad`: No synthetic marker (persistent streams)
      - `manual`: Explicit speech end marker
      - `client-vad`: Trailing silence for clean cutoff
    - Cleans up resources and destroys receiver subscription
  - **Transcript Handling:**
    - `handleTranscriptSegment()` – Stores segments (200-item limit), invokes callbacks, sends embeds
    - Resolves speaker member from cache or API
    - Builds and sends transcript embeds to text channel if enabled

### Endpointing Strategies
- **`server-vad`** (recommended):
  - Server-managed voice activity detection
  - Persistent audio subscriptions (no speaking end handling)
  - Engine determines turn boundaries
  - Best for natural conversations
- **`manual`**:
  - Explicit speech end markers
  - Requires `commit()` call to trigger response
  - Used for push-to-talk style interactions

### Voice Configuration
- **Structure:** `VoiceRuntimeConfig` with nested objects:
  - `enabled` – Master switch for voice features
  - `endpointing` – Strategy: `'server-vad'` | `'manual'`
  - `model` – Optional voice model override
  - `playbackVoice` – TTS voice ID (e.g., 'alloy', 'echo')
  - `maxConcurrentChannels` – Limit per guild (default: 2)
  - `instructions` – Voice-specific system prompt
  - `capture` – Audio capture settings:
    - `channels` – Number of channels (1 for mono)
    - `sampleRate` – Target rate for engine (default: 24000)
    - `silenceDurationMs` – Silence before ending capture (client-vad, default: 300)
    - `vadThreshold` – Voice activity detection threshold (0-1, default: 0.01)
  - `playback` – Playback settings:
    - `sampleRate` – Playback rate (default: 48000 for Discord)
  - `transcript` – Transcript embed settings:
    - `enabled` – Whether to send embeds
    - `targetChannelId` – Optional specific channel
  - `perGuild` – Per-guild configuration overrides (merged with base)
- **Merging:** `mergeVoiceConfig()` and `mergeVoiceConfigPatch()` perform deep merging of nested objects
- **Defaults:** `getDefaultVoiceConfig()` provides sensible defaults

### Voice Metrics
- `core/voice/metrics.ts` tracks:
  - `realtimeReconnectAttempts` – Total reconnection attempts
  - `transcriptSegments` – Total segments processed
  - `failedFrameAppends` – Failed frame append operations
- Exposed via `AI.getVoiceMetrics()` and `voiceManager.getStatus()`
- Incremented via `incrementRealtimeReconnects()`, `incrementTranscriptSegments()`, `incrementFailedFrameAppends()`

### Audio Processing Utilities
- `core/voice/audio-utils.ts` provides:
  - `bufferToInt16()` / `int16ToBuffer()` – Format conversions
  - `toMono(samples, channels)` – Stereo to mono conversion (averages channels)
  - `downsample(samples, inputRate, outputRate)` – Averaging-based downsampling
  - `upsample(samples, inputRate, outputRate)` – Linear interpolation upsampling
  - `calculateRms(samples)` – Root Mean Square energy for VAD (normalized 0-1)
  - `clampInt16(value)` – Clamps to Int16 range (-32768 to 32767)

### Realtime Session Details
- `engines/openai/realtime-session.ts` (`OpenAiRealtimeSession` class):
  - **WebSocket Communication:**
    - Connects to `wss://api.openai.com/v1/realtime?model=...`
    - Sends `session.update` with turn detection, audio formats, tools, voice, transcription config
    - Handles `open`, `error`, `close`, `message` events
  - **Tool Call Buffering:**
    - Accumulates function call data across multiple delta events
    - Two buffer types: legacy `_toolCallBuffers` and output item `_outputFnBuffers`
    - Emits complete tool calls via `'toolCall'` event when name and arguments are available
    - Handles `response.function_call.arguments.delta`, `response.function_call.arguments.done`, `response.output_item.done`
  - **Usage Deduplication:**
    - Tracks response IDs in `_usageResponses` set
    - Skips duplicate usage reports for same response
    - Normalizes usage from various envelope structures
  - **Audio Streaming:**
    - `append(frame)` – Encodes PCM16 to base64, sends `input_audio_buffer.append`
    - `commit()` – Sends `input_audio_buffer.commit` for manual endpointing
    - Handles `response.audio.delta` events, decodes base64 to PCM16
  - **Transcript Capture:**
    - Processes `conversation.item.input_audio_transcription.completed` (user speech)
    - Processes `response.output_item.done` with audio content (assistant speech)
    - Tracks speaker IDs for attribution
  - **Barge-in Support:**
    - `interrupt(responseId?)` – Cancels in-progress response
    - Sends `response.cancel` event
  - **Connection Management:**
    - `dispose()` – Closes WebSocket gracefully
    - Emits `'dropped'` event on unexpected close for retry logic

## Utilities
- `discord-utils.ts` – Chunking, mention replacement, and the mock interaction adapter for tool execution.

## Configuration Touchpoints
- Plugin options (config file `config/plugins/robojs/ai.*`): `instructions`, `commands` allow/deny, `restrict`, `whitelist`, `context` (surrounding context config with `enabled` and `depth`), `insight`, `engine`, `mcpServers`, optional `voice` overrides (`voice.instructions`, realtime config, etc.).
- Default chat behavior (model, temperature, max output tokens) now comes from the engine constructor. The bundled `OpenAiEngine` accepts `new OpenAiEngine({ chat: { model, temperature, maxOutputTokens } })`.
- Sage options (global or per-command) influence auto-deferral (`defer`, `deferBuffer`, `ephemeral`). `getCommandReply` reads them via `resolveSageOptions`.
- Env requirements: `OPENAI_API_KEY` (default engine); vector store files under `/documents`.
- Voice config block (optional) supports: `enabled`, `model`, `maxConcurrentChannels`, `playbackVoice`, nested `capture` + `transcript` objects, and `perGuild` overrides—all merged via `voiceManager`.

## Persistence
- Flashcore namespaces:
  - `@robojs/ai/conversation` – Conversation state snapshots (conversation IDs, summaries, history tails)
  - `@robojs/ai/knowledge` – Vector store ID + file cache (hash-based change detection)
  - `@robojs/ai/voice` – Voice session metadata + transcript tail (for reconnection context restoration)
  - `@robojs/ai/voice-config` – Base/per-guild voice configuration patches
  - `@robojs/ai/tokens` – Token usage aggregates and daily entry logs
  - `ai/modes` – Saved mode presets (via `AiEngine.Modes`)
- Tool digests live in-memory only (per-channel map in `tool-runner.ts`); ensure downstream consumers read them before shutdown if persistence needed
- Token ledger aggregates are cached in-memory (`aggregatesCache`) and synced to Flashcore on every `recordUsage()` call
- Voice transcript tails are persisted via `persistVoiceTranscriptTail()` and loaded via `loadVoiceTranscriptTail()` for context restoration after reconnection

## Extension Hooks
- Swap engines by supplying a `BaseEngine` subclass via config.
- Engine hooks (`engine.on('chat', hook)`) can pre-process messages for prompt injection or throttling.
- Reply hooks (`engine.on('reply', hook)`) can intercept and override the final response, accessing cumulative tool usage (including MCP calls) and reasoning data.
  - `ReplyHookContext` provides `response`, `mcpCalls`, `degradedMcpServers`, `channel`, `member`, and `user`.
  - `degradedMcpServers` is an array of MCP server labels that were removed due to persistent failures, allowing hooks to apply post-processing or send notifications.
  - Returning a `ChatReply` object (text, components, files, flags) overrides the default engine response.
- Hooks can be registered globally via `pluginOptions.hooks` in the config file.
- Additional tools/commands auto-register if exposed through the Robo command portal and allowed by plugin config.

## Operational Notes
- When adding/altering tool commands, verify they resolve the mock interaction via `interaction.reply`/`editReply`; otherwise tasks hang
- For long operations, rely on `notifyDeferred` to register background tasks and provide UX feedback
- Monitor `/documents` size and file types—only supported text-like formats upload cleanly to OpenAI vector store
- Voice enablement requires Discord permissions (`CONNECT`, `SPEAK`, `SEND_MESSAGES` for transcript embeds)
- **Seed commands are optional:** Users can delete, modify, or keep them. The bot functions without them via mentions, replies, and whitelisted channels
- **Vision capabilities work automatically:** No configuration needed when using vision-capable models (gpt-4o, gpt-4.1, gpt-5, o1, o3). Discord image attachments are converted to image URLs for processing
- **Web search requires explicit configuration:** Set `webSearch: true` in OpenAI engine constructor to enable. Citation links are automatically formatted in responses
- **Token limits are enforced:** Configure via `tokenLedger.configure()` with `mode: 'block'` to throw `TokenLimitError` or `mode: 'warn'` to emit events. Monitor usage via `/ai usage` seed command or `tokenLedger.getSummary()`
- **Voice audio processing:** PCM16 format, 48kHz→24kHz downsampling, mono conversion, VAD threshold application. Adjust `capture.vadThreshold` if voice detection is too sensitive/insensitive
- **Realtime session retry:** Exponential backoff with transcript tail restoration. Failed reconnections increment `realtimeReconnectAttempts` metric
- **MCP servers require valid credentials:** Ensure environment variables for MCP API keys (e.g., `CONTEXT7_API_KEY`) are set. Invalid configs are logged during engine initialization.
- Always adjust this AGENTS file if you change flows, options, or storage so future work isn't guessing
